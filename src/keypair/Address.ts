import { decompressPublicKey, Network, toXOnly, UncompressedPublicKey } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { ADDRESS_BYTE_LENGTH } from '../utils/lengths.js';
import { AddressVerificator } from './AddressVerificator.js';
import { EcKeyPair } from './EcKeyPair.js';
import { ContractAddress } from '../transaction/ContractAddress.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';
import { ITimeLockOutput, TimeLockGenerator } from '../transaction/mineable/TimelockGenerator.js';

/**
 * Objects of type "Address" are the representation of tweaked public keys. They can be converted to different address formats.
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

    public constructor(bytes?: ArrayLike<number>) {
        super(ADDRESS_BYTE_LENGTH);

        if (!bytes) {
            return;
        }

        this.set(bytes);
    }

    /**
     * If available, this will return the original public key associated with the address.
     * @returns {Uint8Array} The original public key used to create the address.
     */
    public get originalPublicKey(): Uint8Array | undefined {
        return this.#originalPublicKey;
    }

    /**
     * Get the key pair for the address
     * @description This is only for internal use. Please use address.tweakedBytes instead.
     */
    private get keyPair(): ECPairInterface {
        if (!this.#keyPair) {
            throw new Error('Public key not set for address');
        }

        return this.#keyPair;
    }

    public static dead(): Address {
        return Address.fromString(
            '0x04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f',
        );
    }

    public static zero(): Address {
        return new Address();
    }

    /**
     * Create an address from a hex string
     * @param {string} pubKey The public key
     * @returns {Address} The address
     */
    public static fromString(pubKey: string): Address {
        if (!pubKey) {
            throw new Error('Invalid public key');
        }

        if (pubKey.startsWith('0x')) {
            pubKey = pubKey.slice(2);
        }

        if (!BitcoinUtils.isValidHex(pubKey)) {
            throw new Error(
                'You must only pass public keys in hexadecimal format. If you have an address such as bc1q... you must convert it to a public key first. Please refer to await provider.getPublicKeyInfo("bc1q..."). If the public key associated with the address is not found, you must force the user to enter the destination public key. It looks like: 0x020373626d317ae8788ce3280b491068610d840c23ecb64c14075bbb9f670af52c.',
            );
        }

        return new Address(Buffer.from(pubKey, 'hex'));
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
     * Converts the address to a hex string
     * @returns {string} The hex string
     */
    public toHex(): string {
        return '0x' + Buffer.from(this).toString('hex');
    }

    /**
     * Converts the address to a buffer
     * @returns {Buffer} The buffer
     */
    public toBuffer(): Buffer {
        return Buffer.from(this);
    }

    public toUncompressedHex(): string {
        if (!this.#uncompressed) {
            throw new Error('Public key not set');
        }

        return '0x' + this.#uncompressed.uncompressed.toString('hex');
    }

    public toUncompressedBuffer(): Buffer {
        if (!this.#uncompressed) {
            throw new Error('Public key not set');
        }

        return this.#uncompressed.uncompressed;
    }

    public toHybridPublicKeyHex(): string {
        if (!this.#uncompressed) {
            throw new Error('Public key not set');
        }

        return '0x' + this.#uncompressed.hybrid.toString('hex');
    }

    public toHybridPublicKeyBuffer(): Buffer {
        if (!this.#uncompressed) {
            throw new Error('Public key not set');
        }

        return this.#uncompressed.hybrid;
    }

    public originalPublicKeyBuffer(): Buffer {
        if (!this.#originalPublicKey) {
            throw new Error('Public key not set');
        }

        return Buffer.from(this.#originalPublicKey);
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
     * @param {ArrayLike<number>} publicKey The public key
     * @returns {void}
     */
    public override set(publicKey: ArrayLike<number>): void {
        const validLengths = [ADDRESS_BYTE_LENGTH, 33, 65];
        if (!validLengths.includes(publicKey.length)) {
            throw new Error(`Invalid public key length ${publicKey.length}`);
        }

        if (publicKey.length === ADDRESS_BYTE_LENGTH) {
            const buf = Buffer.alloc(ADDRESS_BYTE_LENGTH);
            buf.set(publicKey);

            this.#tweakedUncompressed = ContractAddress.generateHybridKeyFromHash(buf);

            super.set(publicKey);
        } else {
            this.autoFormat(publicKey);
        }
    }

    /**
     * Check if the public key is valid
     * @param {Network} network The network
     * @returns {boolean} If the public key is valid
     */
    public isValid(network: Network): boolean {
        return AddressVerificator.isValidPublicKey(Buffer.from(this).toString('hex'), network);
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

        const p2trAddy: string | undefined = EcKeyPair.tweakedPubKeyBufferToAddress(this, network);

        if (p2trAddy) {
            this.#network = network;
            this.#p2tr = p2trAddy;

            return p2trAddy;
        }

        throw new Error('Public key not set');
    }

    /**
     * Generate a P2WSH address with CSV (CheckSequenceVerify) timelock
     * The resulting address can only be spent after the specified number of blocks
     * have passed since the UTXO was created.
     *
     * @param {bigint | number | string} blockNumber - The number of blocks that must pass before spending (1-65535)
     * @param {Network} network - The Bitcoin network to use
     * @returns {ITimeLockOutput} The timelocked address and its witness script
     * @throws {Error} If the block number is out of range or public key is not available
     */
    public toCSV(blockNumber: bigint | number | string, network: Network): ITimeLockOutput {
        const n = Number(blockNumber);

        // First, let's validate the block number to ensure it's within the valid range
        // CSV uses sequence numbers, which have special encoding for block-based locks
        if (n < 1 || n > 65535) {
            throw new Error('CSV block number must be between 1 and 65535');
        }

        // We need the original public key in compressed format for the script
        // Your class stores this in #originalPublicKey when a key is set
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
     * Get an opnet address encoded in bech32m format.
     * @param network
     */
    public p2op(network: Network): string {
        if (this.#p2op && this.#network === network) {
            return this.#p2op;
        }

        const p2opAddy: string | undefined = EcKeyPair.p2op(this, network);
        if (p2opAddy) {
            this.#network = network;
            this.#p2op = p2opAddy;

            return p2opAddy;
        }

        throw new Error('Public key not set');
    }

    public toTweakedHybridPublicKeyHex(): string {
        if (!this.#tweakedUncompressed) {
            throw new Error('Public key not set');
        }

        return '0x' + this.#tweakedUncompressed.toString('hex');
    }

    public toTweakedHybridPublicKeyBuffer(): Buffer {
        if (!this.#tweakedUncompressed) {
            throw new Error('Public key not set');
        }

        return this.#tweakedUncompressed;
    }

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

        super.set(tweakedBytes);
    }
}
