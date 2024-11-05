import { Network } from '@btc-vision/bitcoin';
import { EcKeyPair } from './EcKeyPair.js';
import { ECPairInterface } from 'ecpair';
import { ADDRESS_BYTE_LENGTH } from '../utils/types.js';
import { AddressVerificator } from './AddressVerificator.js';
import { toXOnly } from '@btc-vision/bitcoin/src/psbt/bip371.js';

const hexPattern = /^[0-9a-fA-F]+$/;
const isHexadecimal = (input: string): boolean => {
    return hexPattern.test(input);
};

/**
 * Objects of type "Address" are the representation of tweaked public keys. They can be converted to different address formats.
 * @category KeyPair
 */
export class Address extends Uint8Array {
    #p2tr: string | undefined;
    #network: Network | undefined;
    #originalPublicKey: Uint8Array | undefined;
    #keyPair: ECPairInterface | undefined;

    public constructor(bytes?: ArrayLike<number>) {
        super(bytes?.length || ADDRESS_BYTE_LENGTH);

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

        if (!isHexadecimal(pubKey)) {
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

        for (let i = 0; i < 32; i++) {
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

        for (let i = 0; i < 32; i++) {
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
        if (publicKey.length !== 33 && publicKey.length !== 32 && publicKey.length !== 65) {
            throw new Error(`Invalid public key length ${publicKey.length}`);
        }

        if (publicKey.length === 32) {
            const buf = Buffer.alloc(32);
            buf.set(publicKey);

            super.set(publicKey);
        } else {
            this.#originalPublicKey = Uint8Array.from(publicKey);
            this.#keyPair = EcKeyPair.fromPublicKey(this.#originalPublicKey);

            const tweakedBytes = toXOnly(
                EcKeyPair.tweakPublicKey(Buffer.from(this.#originalPublicKey)),
            );

            super.set(tweakedBytes);
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

        const p2trAddy: string | undefined = EcKeyPair.tweakedPubKeyBufferToAddress(this, network);

        if (p2trAddy) {
            this.#network = network;
            this.#p2tr = p2trAddy;

            return p2trAddy;
        }

        throw new Error('Public key not set');
    }
}
