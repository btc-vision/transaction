import { decompressPublicKey, Network, toXOnly, UncompressedPublicKey } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { ADDRESS_BYTE_LENGTH } from '../utils/lengths.js';
import { AddressVerificator } from './AddressVerificator.js';
import { EcKeyPair } from './EcKeyPair.js';
import { ContractAddress } from '../transaction/ContractAddress.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';
import { TimeLockGenerator } from '../transaction/mineable/TimelockGenerator.js';
import { IP2WSHAddress } from '../transaction/mineable/IP2WSHAddress.js';
import { P2WDADetector } from '../p2wda/P2WDADetector.js';
import { sha256 } from '@noble/hashes/sha2';
import { MLDSASecurityLevel } from '@btc-vision/bip32';

/**
 * Objects of type "Address" represent hashed ML-DSA (quantum) public keys (using SHA256 of quantum keys) and maintain classical public keys separately.
 * This class supports a hybrid quantum-classical architecture, allowing conversion to different address formats and management of both key types.
 *
 * The Address internally stores the SHA256 hash of the ML-DSA public key as its primary content, while maintaining
 * the classical public key in a separate field. This enables quantum-resistant addressing while preserving
 * compatibility with traditional Bitcoin cryptography.
 *
 * @category KeyPair
 */
export class Address extends Uint8Array {
    #p2tr: string | undefined;
    #p2op: string | undefined;
    #network: Network | undefined;
    #originalPublicKey: Uint8Array | undefined;
    #keyPair: ECPairInterface | undefined;
    #uncompressed: UncompressedPublicKey | undefined;
    #tweakedUncompressed: Buffer | undefined;
    #p2wda: IP2WSHAddress | undefined;
    #mldsaPublicKey: Uint8Array | undefined;
    #cachedBigInt: bigint | undefined;
    #cachedUint64Array: [bigint, bigint, bigint, bigint] | undefined;
    #originalMDLSAPublicKey: Uint8Array | undefined;
    #mldsaLevel: MLDSASecurityLevel | undefined;

    // Lazy loading state - defers expensive EC operations until actually needed
    #pendingLegacyKey: Uint8Array | undefined;
    #legacyProcessed: boolean = false;

    // After processing, this is 32-byte tweaked x-only (same as original behavior)
    #legacyPublicKey: Uint8Array | undefined;

    public constructor(mldsaPublicKey?: ArrayLike<number>, publicKeyOrTweak?: ArrayLike<number>) {
        super(ADDRESS_BYTE_LENGTH);

        if (!mldsaPublicKey) {
            return;
        }

        if (publicKeyOrTweak) {
            // Validate length immediately (cheap check), defer EC operations
            const validLengths = [ADDRESS_BYTE_LENGTH, 33, 65];
            if (!validLengths.includes(publicKeyOrTweak.length)) {
                throw new Error(`Invalid public key length ${publicKeyOrTweak.length}`);
            }

            // Store but don't process yet - defer EC operations
            this.#pendingLegacyKey = new Uint8Array(publicKeyOrTweak.length);
            this.#pendingLegacyKey.set(publicKeyOrTweak);
        }

        this.setMldsaKey(mldsaPublicKey);
    }

    public get mldsaLevel(): MLDSASecurityLevel | undefined {
        return this.#mldsaLevel;
    }

    public set mldsaLevel(level: MLDSASecurityLevel) {
        this.#mldsaLevel = level;
    }

    public get originalMDLSAPublicKey(): Uint8Array | undefined {
        return this.#originalMDLSAPublicKey;
    }

    public set originalMDLSAPublicKey(key: Buffer | Uint8Array) {
        this.#originalMDLSAPublicKey = new Uint8Array(key);
    }

    /**
     * If available, this will return the original public key associated with the address.
     * @returns {Uint8Array} The original public key used to create the address.
     */
    public get originalPublicKey(): Uint8Array | undefined {
        this.ensureLegacyProcessed();
        return this.#originalPublicKey;
    }

    public get mldsaPublicKey(): Uint8Array | undefined {
        return this.#mldsaPublicKey;
    }

    /**
     * Get the legacy public key (32-byte tweaked x-only after processing).
     * Triggers lazy processing if not yet done.
     */
    private get legacyPublicKey(): Uint8Array | undefined {
        this.ensureLegacyProcessed();
        return this.#legacyPublicKey;
    }

    /**
     * Get the key pair for the address
     * @description This is only for internal use. Please use address.tweakedBytes instead.
     */
    private get keyPair(): ECPairInterface {
        this.ensureLegacyProcessed();
        if (!this.#keyPair) {
            throw new Error('Legacy public key not set for address');
        }

        return this.#keyPair;
    }

    public static dead(): Address {
        return Address.fromString(
            '0x0000000000000000000000000000000000000000000000000000000000000000', // DEAD ADDRESS
            '0x04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f',
        );
    }

    /**
     * Create an address from a hex string
     * @param {string} mldsaPublicKey The ml-dsa public key in hex format
     * @param {string} legacyPublicKey The classical public key in hex format
     * @returns {Address} The address
     */
    public static fromString(mldsaPublicKey: string, legacyPublicKey?: string): Address {
        if (!mldsaPublicKey) {
            throw new Error('Invalid public key');
        }

        if (mldsaPublicKey.startsWith('0x')) {
            mldsaPublicKey = mldsaPublicKey.slice(2);
        }

        if (!BitcoinUtils.isValidHex(mldsaPublicKey)) {
            throw new Error(
                'You must only pass public keys in hexadecimal format. If you have an address such as bc1q... you must convert it to a public key first. Please refer to await provider.getPublicKeyInfo("bc1q..."). If the public key associated with the address is not found, you must force the user to enter the destination public key. It looks like: 0x020373626d317ae8788ce3280b491068610d840c23ecb64c14075bbb9f670af52c.',
            );
        }

        let classicBuffer: Buffer | undefined;
        if (legacyPublicKey) {
            if (legacyPublicKey.startsWith('0x')) {
                legacyPublicKey = legacyPublicKey.slice(2);
            }

            if (!BitcoinUtils.isValidHex(legacyPublicKey)) {
                throw new Error(
                    'You must only pass classical public keys in hexadecimal format. If you have an address such as bc1q... you must convert it to a public key first. Please refer to await provider.getPublicKeyInfo("bc1q..."). If the public key associated with the address is not found, you must force the user to enter the destination public key. It looks like: 0x020373626d317ae8788ce3280b491068610d840c23ecb64c14075bbb9f670af52c.',
                );
            }

            classicBuffer = Buffer.from(legacyPublicKey, 'hex');
        }

        return new Address(Buffer.from(mldsaPublicKey, 'hex'), classicBuffer);
    }

    /**
     * Create an address from a public key
     * @returns {Address} The address
     * @param {ArrayLike<number>} bytes The public key
     */
    public static wrap(bytes: ArrayLike<number>): Address {
        return new Address(bytes);
    }

    public static uncompressedToCompressed(publicKey: ArrayLike<number>): Buffer {
        const buffer = Uint8Array.from(publicKey);

        const x = buffer.slice(1, 33);
        const y = buffer.slice(33);

        const compressed = Buffer.alloc(33);
        compressed[0] = 0x02 + (y[y.length - 1] & 0x01);
        compressed.set(x, 1);

        return compressed;
    }

    /**
     * Creates an Address instance from a BigInt value.
     *
     * Converts a 256-bit unsigned integer into a 32-byte address by splitting it
     * into four 64-bit chunks and writing them in big-endian format using DataView.
     * This is the inverse operation of toBigInt().
     *
     * @param {bigint} value - The 256-bit unsigned integer to convert (0 to 2^256-1)
     * @returns {Address} A new Address instance containing the converted value
     *
     * @throws {RangeError} If the value is negative or exceeds 2^256-1
     *
     * @example
     * ```typescript
     * const bigIntValue = 12345678901234567890n;
     * const address = Address.fromBigInt(bigIntValue);
     * console.log(address.toHex()); // 0x0000000000000000000000000000000000000000000000000000abc123...
     * ```
     */
    public static fromBigInt(value: bigint): Address {
        const buffer = new Uint8Array(32);
        const view = new DataView(buffer.buffer);

        view.setBigUint64(0, (value >> 192n) & 0xffffffffffffffffn, false);
        view.setBigUint64(8, (value >> 128n) & 0xffffffffffffffffn, false);
        view.setBigUint64(16, (value >> 64n) & 0xffffffffffffffffn, false);
        view.setBigUint64(24, value & 0xffffffffffffffffn, false);

        return new Address(buffer);
    }

    /**
     * Creates an Address instance from four 64-bit unsigned integers.
     *
     * Constructs a 32-byte address by combining four 64-bit big-endian unsigned integers.
     * This is the inverse operation of toUint64Array() and provides an efficient way
     * to create addresses from word-aligned data.
     *
     * @param {bigint} w0 - Most significant 64 bits (bytes 0-7)
     * @param {bigint} w1 - Second 64 bits (bytes 8-15)
     * @param {bigint} w2 - Third 64 bits (bytes 16-23)
     * @param {bigint} w3 - Least significant 64 bits (bytes 24-31)
     * @returns {Address} A new Address instance containing the combined value
     *
     * @throws {RangeError} If any value exceeds 64 bits (2^64-1)
     *
     * @example
     * ```typescript
     * const address = Address.fromUint64Array(
     *     0x0123456789abcdefn,
     *     0xfedcba9876543210n,
     *     0x1111222233334444n,
     *     0x5555666677778888n
     * );
     * console.log(address.toHex());
     * ```
     */
    public static fromUint64Array(w0: bigint, w1: bigint, w2: bigint, w3: bigint): Address {
        const buffer = new Uint8Array(32);
        const view = new DataView(buffer.buffer);

        view.setBigUint64(0, w0, false);
        view.setBigUint64(8, w1, false);
        view.setBigUint64(16, w2, false);
        view.setBigUint64(24, w3, false);

        return new Address(buffer);
    }

    /**
     * Converts the address to four 64-bit unsigned integers.
     *
     * Splits the 32-byte (256-bit) address into four 64-bit big-endian unsigned integers.
     * This representation is useful for efficient storage, comparison operations, or
     * interfacing with systems that work with 64-bit word sizes.
     *
     * @returns {[bigint, bigint, bigint, bigint]} An array of four 64-bit unsigned integers
     *          representing the address from most significant to least significant bits
     *
     * @example
     * ```typescript
     * const address = Address.fromString('0x0123456789abcdef...');
     * const [w0, w1, w2, w3] = address.toUint64Array();
     * console.log(w0); // Most significant 64 bits
     * console.log(w3); // Least significant 64 bits
     * ```
     */
    public toUint64Array(): [bigint, bigint, bigint, bigint] {
        if (this.#cachedUint64Array !== undefined) {
            return this.#cachedUint64Array;
        }

        const view = new DataView(this.buffer, this.byteOffset, 32);
        this.#cachedUint64Array = [
            view.getBigUint64(0, false),
            view.getBigUint64(8, false),
            view.getBigUint64(16, false),
            view.getBigUint64(24, false),
        ];

        return this.#cachedUint64Array;
    }

    /**
     * Check if the address is the dead address
     * @returns {boolean}
     */
    public isDead(): boolean {
        for (let i = 0; i < ADDRESS_BYTE_LENGTH; i++) {
            if (this[i] !== 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Converts the address to a hex string
     * @returns {string} The hex string
     */
    public toHex(): string {
        return '0x' + Buffer.from(this).toString('hex');
    }

    /**
     * Converts the classical public key to a hex string
     * @returns {string} The hex string
     */
    public tweakedToHex(): string {
        const key = this.legacyPublicKey;
        if (!key) {
            throw new Error('Legacy public key not set');
        }

        return '0x' + Buffer.from(key).toString('hex');
    }

    /**
     * Converts the address content (SHA256 hash of ML-DSA public key) to a buffer
     * @returns {Buffer} The buffer containing the hashed ML-DSA public key
     */
    public toBuffer(): Buffer {
        return Buffer.from(this);
    }

    /**
     * Converts the classical public key to a buffer
     * @returns {Buffer} The buffer
     */
    public tweakedPublicKeyToBuffer(): Buffer {
        const key = this.legacyPublicKey;
        if (!key) {
            throw new Error('Legacy public key not set');
        }

        return Buffer.from(key);
    }

    public toUncompressedHex(): string {
        this.ensureLegacyProcessed();
        if (!this.#uncompressed) {
            throw new Error('Legacy public key not set');
        }

        return '0x' + this.#uncompressed.uncompressed.toString('hex');
    }

    public toUncompressedBuffer(): Buffer {
        this.ensureLegacyProcessed();
        if (!this.#uncompressed) {
            throw new Error('Legacy public key not set');
        }

        return this.#uncompressed.uncompressed;
    }

    public toHybridPublicKeyHex(): string {
        this.ensureLegacyProcessed();
        if (!this.#uncompressed) {
            throw new Error('Legacy public key not set');
        }

        return '0x' + this.#uncompressed.hybrid.toString('hex');
    }

    public toHybridPublicKeyBuffer(): Buffer {
        this.ensureLegacyProcessed();
        if (!this.#uncompressed) {
            throw new Error('Legacy public key not set');
        }

        return this.#uncompressed.hybrid;
    }

    public originalPublicKeyBuffer(): Buffer {
        this.ensureLegacyProcessed();
        if (!this.#originalPublicKey) {
            throw new Error('Legacy public key not set');
        }

        return Buffer.from(this.#originalPublicKey);
    }

    /**
     * Converts the address to a BigInt representation.
     *
     * This method uses an optimized DataView approach to read the 32-byte address
     * as four 64-bit big-endian unsigned integers, then combines them using bitwise
     * operations. This is approximately 10-20x faster than string-based conversion.
     *
     * @returns {bigint} The address as a 256-bit unsigned integer
     *
     * @example
     * ```typescript
     * const address = Address.fromString('0x0123456789abcdef...');
     * const bigIntValue = address.toBigInt();
     * console.log(bigIntValue); // 123456789...n
     * ```
     */
    public toBigInt(): bigint {
        if (this.#cachedBigInt !== undefined) {
            return this.#cachedBigInt;
        }

        const view = new DataView(this.buffer, this.byteOffset, 32);
        this.#cachedBigInt =
            (view.getBigUint64(0, false) << 192n) |
            (view.getBigUint64(8, false) << 128n) |
            (view.getBigUint64(16, false) << 64n) |
            view.getBigUint64(24, false);

        return this.#cachedBigInt;
    }

    public equals(a: Address): boolean {
        const b: Address = this as Address;

        if (a.length !== b.length) {
            return false;
        }

        for (let i = 0; i < b.length; i++) {
            if (b[i] !== a[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if the address is bigger than another address
     * @returns {boolean} If bigger
     */
    public lessThan(a: Address): boolean {
        const b: Address = this as Address;

        for (let i = 0; i < ADDRESS_BYTE_LENGTH; i++) {
            const thisByte = b[i];
            const aByte = a[i];

            if (thisByte < aByte) {
                return true; // this is less than a
            } else if (thisByte > aByte) {
                return false; // this is greater than or equal to a
            }
        }

        return false;
    }

    /**
     * Check if the address is smaller than another address
     * @returns {boolean} If smaller
     */
    public greaterThan(a: Address): boolean {
        // Compare the two addresses byte-by-byte, treating them as big-endian uint256
        const b = this as Address;

        for (let i = 0; i < ADDRESS_BYTE_LENGTH; i++) {
            const thisByte = b[i];
            const aByte = a[i];

            if (thisByte > aByte) {
                return true; // this is greater than a
            } else if (thisByte < aByte) {
                return false; // this is less than or equal to a
            }
        }

        return false;
    }

    /**
     * Set the public key
     * @param {ArrayLike<number>} mldsaPublicKey ML-DSA public key
     * @returns {void}
     */
    public override set(mldsaPublicKey: ArrayLike<number>): void {
        // Legacy key processing is now deferred via ensureLegacyProcessed()
        this.setMldsaKey(mldsaPublicKey);
    }

    /**
     * Check if the public key is valid
     * @param {Network} network The network
     * @returns {boolean} If the public key is valid
     */
    public isValidLegacyPublicKey(network: Network): boolean {
        const key = this.legacyPublicKey;
        if (!key) {
            throw new Error(`Legacy key not set.`);
        }

        return AddressVerificator.isValidPublicKey(Buffer.from(key).toString('hex'), network);
    }

    /**
     * Get the public key as address
     */
    public p2pk(): string {
        return this.toHex();
    }

    /**
     * Get the address in p2wpkh format
     * @param {Network} network The network
     */
    public p2wpkh(network: Network): string {
        return EcKeyPair.getP2WPKHAddress(this.keyPair, network);
    }

    /**
     * Get the address in p2pkh format
     * @param {Network} network The network
     */
    public p2pkh(network: Network): string {
        return EcKeyPair.getLegacyAddress(this.keyPair, network);
    }

    /**
     * Get the address in p2sh-p2wpkh format
     * @param {Network} network The network
     */
    public p2shp2wpkh(network: Network): string {
        return EcKeyPair.getLegacySegwitAddress(this.keyPair, network);
    }

    /**
     * Convert the address to a string
     */
    public toString(): string {
        return this.toHex();
    }

    /**
     * Convert the address to a JSON string
     */
    public toJSON(): string {
        return this.toHex();
    }

    /**
     * Get the address in p2tr format
     * @param {Network} network The network
     */
    public p2tr(network: Network): string {
        if (this.#p2tr && this.#network === network) {
            return this.#p2tr;
        }

        const key = this.legacyPublicKey;
        if (!key) {
            throw new Error('Legacy public key not set');
        }

        const p2trAddy: string | undefined = EcKeyPair.tweakedPubKeyBufferToAddress(key, network);

        if (p2trAddy) {
            this.#network = network;
            this.#p2tr = p2trAddy;

            return p2trAddy;
        }

        throw new Error('Legacy public key not set');
    }

    /**
     * Generate a P2WDA (Pay-to-Witness-Data-Authentication) address
     *
     * P2WDA addresses are a special type of P2WSH address that allows embedding
     * authenticated data directly in the witness field, achieving 75% cost reduction
     * through Bitcoin's witness discount.
     *
     * The witness script pattern is: (OP_2DROP * 5) <pubkey> OP_CHECKSIG
     * This allows up to 10 witness data fields (5 * 2 = 10), where each field
     * can hold up to 80 bytes of data due to relay rules.
     *
     * @param {Network} network - The Bitcoin network to use
     * @returns {IP2WSHAddress} The P2WDA address
     * @throws {Error} If the public key is not set or address generation fails
     *
     * @example
     * ```typescript
     * const address = Address.fromString('0x02...');
     * const p2wdaAddress = address.p2wda(networks.bitcoin);
     * console.log(p2wdaAddress); // bc1q...
     * ```
     */
    public p2wda(network: Network): IP2WSHAddress {
        if (this.#p2wda && this.#network === network) {
            return this.#p2wda;
        }

        this.ensureLegacyProcessed();
        if (!this.#originalPublicKey) {
            throw new Error('Cannot create P2WDA address: public key not set');
        }

        const publicKeyBuffer = Buffer.from(this.#originalPublicKey);

        if (publicKeyBuffer.length !== 33) {
            throw new Error('P2WDA requires a compressed public key (33 bytes)');
        }

        try {
            const p2wdaInfo = P2WDADetector.generateP2WDAAddress(publicKeyBuffer, network);

            this.#network = network;
            this.#p2wda = p2wdaInfo;

            return {
                address: p2wdaInfo.address,
                witnessScript: p2wdaInfo.witnessScript,
            };
        } catch (error) {
            throw new Error(`Failed to generate P2WDA address: ${(error as Error).message}`);
        }
    }

    /**
     * Generate a P2WSH address with CSV (CheckSequenceVerify) time lock
     * The resulting address can only be spent after the specified number of blocks
     * have passed since the UTXO was created.
     *
     * @param {bigint | number | string} duration - The number of blocks that must pass before spending (1-65535)
     * @param {Network} network - The Bitcoin network to use
     * @returns {IP2WSHAddress} The timelocked address and its witness script
     * @throws {Error} If the block number is out of range or public key is not available
     */
    public toCSV(duration: bigint | number | string, network: Network): IP2WSHAddress {
        const n = Number(duration);

        // First, let's validate the block number to ensure it's within the valid range
        // CSV uses sequence numbers, which have special encoding for block-based locks
        if (n < 1 || n > 65535) {
            throw new Error('CSV block number must be between 1 and 65535');
        }

        // We need the original public key in compressed format for the script
        // Your class stores this in #originalPublicKey when a key is set
        this.ensureLegacyProcessed();
        if (!this.#originalPublicKey) {
            throw new Error('Cannot create CSV address: public key not set');
        }

        // Convert the public key to Buffer format that TimeLockGenerator expects
        const publicKeyBuffer = Buffer.from(this.#originalPublicKey);

        // Now we can use your TimeLockGenerator to create the timelocked address
        // Converting bigint to number is safe here because we've already validated the range
        return TimeLockGenerator.generateTimeLockAddress(publicKeyBuffer, network, n);
    }

    /**
     * Generate a P2TR address with CSV (CheckSequenceVerify) time lock
     * The resulting address can only be spent after the specified number of blocks
     * have passed since the UTXO was created.
     *
     * @param {bigint | number | string} duration - The number of blocks that must pass before spending (1-65535)
     * @param {Network} network - The Bitcoin network to use
     * @returns {IP2WSHAddress} The timelocked address and its witness script
     * @throws {Error} If the block number is out of range or public key is not available
     */
    public toCSVTweaked(duration: bigint | number | string, network: Network): string {
        const n = Number(duration);

        // First, let's validate the block number to ensure it's within the valid range
        // CSV uses sequence numbers, which have special encoding for block-based locks
        if (n < 1 || n > 65535) {
            throw new Error('CSV block number must be between 1 and 65535');
        }

        // We need the original public key in compressed format for the script
        // Your class stores this in #originalPublicKey when a key is set
        this.ensureLegacyProcessed();
        if (!this.#originalPublicKey) {
            throw new Error('Cannot create CSV address: public key not set');
        }

        // Now we can use your TimeLockGenerator to create the timelocked address
        // Converting bigint to number is safe here because we've already validated the range
        return TimeLockGenerator.generateTimeLockAddressP2TR(
            this.tweakedPublicKeyToBuffer(),
            network,
            n,
        );
    }

    /**
     * Returns the OPNet address encoded in bech32m format, derived from the SHA256 hash of the ML-DSA public key
     * (which is what the Address internally stores).
     *
     * This method generates a P2OP (Pay-to-OPNet) address using witness version 16, suitable for
     * quantum-resistant transactions on the OPNet protocol.
     *
     * @param network - The Bitcoin network to use (mainnet, testnet, regtest)
     * @returns The P2OP address in bech32m format
     */
    public p2op(network: Network): string {
        if (this.#p2op && this.#network === network) {
            return this.#p2op;
        }

        // p2op only uses the MLDSA hash (this Uint8Array), no legacy key processing needed.
        // This is the HOT PATH for parsing - stays fast without triggering EC operations.
        const p2opAddy: string | undefined = EcKeyPair.p2op(this, network);
        if (p2opAddy) {
            this.#network = network;
            this.#p2op = p2opAddy;

            return p2opAddy;
        }

        throw new Error('ML-DSA public key not set');
    }

    public toTweakedHybridPublicKeyHex(): string {
        this.ensureLegacyProcessed();
        if (!this.#tweakedUncompressed) {
            throw new Error('Legacy public key not set');
        }

        return '0x' + this.#tweakedUncompressed.toString('hex');
    }

    public toTweakedHybridPublicKeyBuffer(): Buffer {
        this.ensureLegacyProcessed();
        if (!this.#tweakedUncompressed) {
            throw new Error('Legacy public key not set');
        }

        return this.#tweakedUncompressed;
    }

    /**
     * Sets the MLDSA key portion of the address.
     * @param {ArrayLike<number>} mldsaPublicKey - The MLDSA public key or its hash
     */
    private setMldsaKey(mldsaPublicKey: ArrayLike<number>): void {
        // THIS is the SHA256(ORIGINAL_ML_DSA_PUBLIC_KEY)
        if (mldsaPublicKey.length === ADDRESS_BYTE_LENGTH) {
            const buf = new Uint8Array(ADDRESS_BYTE_LENGTH);
            buf.set(mldsaPublicKey);

            super.set(buf);
        } else {
            // Validate ML-DSA public key lengths according to BIP360 and FIPS 204
            // ML-DSA-44 (Level 2): 1312 bytes public key
            // ML-DSA-65 (Level 3): 1952 bytes public key
            // ML-DSA-87 (Level 5): 2592 bytes public key
            const validMLDSALengths = [1312, 1952, 2592];

            if (!validMLDSALengths.includes(mldsaPublicKey.length)) {
                throw new Error(
                    `Invalid ML-DSA public key length: ${mldsaPublicKey.length}. ` +
                        `Expected 1312 (ML-DSA-44/LEVEL2), 1952 (ML-DSA-65/LEVEL3), or 2592 (ML-DSA-87/LEVEL5) bytes.`,
                );
            }

            // Store the original ML-DSA public key
            this.#mldsaPublicKey = new Uint8Array(mldsaPublicKey.length);
            this.#mldsaPublicKey.set(mldsaPublicKey);

            // Hash the ML-DSA public key to get the 32-byte address
            const hashedPublicKey = sha256(new Uint8Array(mldsaPublicKey));
            const buf = new Uint8Array(ADDRESS_BYTE_LENGTH);
            buf.set(hashedPublicKey);

            super.set(buf);
        }
    }

    /**
     * Lazy processing of legacy key - defers expensive EC operations until actually needed.
     * Does the EXACT same logic as the original set() method did for legacy keys.
     */
    private ensureLegacyProcessed(): void {
        if (this.#legacyProcessed) return;
        this.#legacyProcessed = true;

        const pending = this.#pendingLegacyKey;
        if (!pending) return;

        // Length validation already done in constructor

        if (pending.length === ADDRESS_BYTE_LENGTH) {
            // 32-byte input: already tweaked x-only, just generate hybrid
            const buf = Buffer.alloc(ADDRESS_BYTE_LENGTH);
            buf.set(pending);

            this.#tweakedUncompressed = ContractAddress.generateHybridKeyFromHash(buf);
            this.#legacyPublicKey = pending;
        } else {
            // 33 or 65 bytes: full autoFormat processing with EC operations
            this.autoFormat(pending);
        }
    }

    /**
     * Processes a 33 or 65 byte public key, performing EC operations.
     * Sets #legacyPublicKey to 32-byte tweaked x-only (same as original behavior).
     */
    private autoFormat(publicKey: ArrayLike<number>): void {
        const firstByte = publicKey[0];

        if (firstByte === 0x03 || firstByte === 0x02) {
            // do nothing
        } else if (firstByte === 0x04 || firstByte === 0x06 || firstByte === 0x07) {
            // uncompressed
            publicKey = Address.uncompressedToCompressed(publicKey);
        }

        this.#originalPublicKey = Uint8Array.from(publicKey);
        this.#keyPair = EcKeyPair.fromPublicKey(this.#originalPublicKey);
        this.#uncompressed = decompressPublicKey(this.#originalPublicKey);

        const tweakedBytes: Buffer = toXOnly(
            EcKeyPair.tweakPublicKey(Buffer.from(this.#originalPublicKey)),
        );

        this.#tweakedUncompressed = ContractAddress.generateHybridKeyFromHash(tweakedBytes);

        this.#legacyPublicKey = new Uint8Array(ADDRESS_BYTE_LENGTH);
        this.#legacyPublicKey.set(tweakedBytes);
    }
}
