import { Network } from 'bitcoinjs-lib';
import { EcKeyPair } from './EcKeyPair.js';
import { ECPairInterface } from 'ecpair';
import { ADDRESS_BYTE_LENGTH } from '../utils/types.js';
import { AddressVerificator } from './AddressVerificator.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';

export class Address extends Uint8Array {
    private isP2TROnly: boolean = false;
    #p2tr: string | undefined;
    #network: Network | undefined;
    #tweakedBytes: Uint8Array | undefined;

    public constructor(bytes?: ArrayLike<number>) {
        super(bytes?.length || ADDRESS_BYTE_LENGTH);

        if (!bytes) {
            return;
        }

        this.set(bytes);
    }

    private _keyPair: ECPairInterface | undefined;

    /**
     * Get the key pair for the address
     */
    public get keyPair(): ECPairInterface {
        if (!this._keyPair) {
            throw new Error('Public key not set for address');
        }

        return this._keyPair;
    }

    /**
     * Get the tweaked bytes
     * @returns {Uint8Array} The tweaked bytes
     */
    public get tweakedBytes(): Uint8Array {
        return this.#tweakedBytes || this;
    }

    public static dead(): Address {
        return Address.fromString(
            '0x04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f',
        );
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

    public equals(a: Address): boolean {
        const b = this.isP2TROnly ? this : (this.#tweakedBytes as Uint8Array);
        const c = a.isP2TROnly ? a : (a.#tweakedBytes as Uint8Array);

        if (c.length !== b.length) {
            return false;
        }

        for (let i = 0; i < b.length; i++) {
            if (b[i] !== c[i]) {
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
        // Compare the two addresses byte-by-byte, treating them as big-endian uint256
        const b = this.isP2TROnly ? this : (this.#tweakedBytes as Uint8Array);
        const c = a.isP2TROnly ? a : (a.#tweakedBytes as Uint8Array);

        for (let i = 0; i < 32; i++) {
            const thisByte = b[i];
            const aByte = c[i];

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
        const b = this.isP2TROnly ? this : (this.#tweakedBytes as Uint8Array);
        const c = a.isP2TROnly ? a : (a.#tweakedBytes as Uint8Array);

        for (let i = 0; i < 32; i++) {
            const thisByte = b[i];
            const aByte = c[i];

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
        if (publicKey.length !== 33 && publicKey.length !== 32 && publicKey.length !== 65) {
            throw new Error(`Invalid public key length ${publicKey.length}`);
        }

        if (publicKey.length === 32) {
            this.isP2TROnly = true;

            const buf = Buffer.alloc(32);
            buf.set(publicKey);

            super.set(publicKey);
        } else {
            this._keyPair = EcKeyPair.fromPublicKey(Uint8Array.from(publicKey));

            this.#tweakedBytes = toXOnly(
                Buffer.from(
                    EcKeyPair.tweakPublicKey(this._keyPair.publicKey.toString('hex')),
                    'hex',
                ),
            );

            super.set(publicKey);
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
        if (this.#p2tr) {
            return this.#p2tr;
        }

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

        const p2trAddy: string | undefined = EcKeyPair.tweakedPubKeyBufferToAddress(
            this.isP2TROnly ? this : (this.#tweakedBytes as Uint8Array),
            network,
        );

        if (p2trAddy) {
            this.#network = network;
            this.#p2tr = p2trAddy;

            return p2trAddy;
        }

        throw new Error('Public key not set');
    }
}
