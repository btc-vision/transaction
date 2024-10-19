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

    public constructor(bytes?: ArrayLike<number>) {
        super(ADDRESS_BYTE_LENGTH);

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

    public equals(a: Address): boolean {
        if (a.length !== this.length) {
            return false;
        }

        for (let i = 0; i < this.length; i++) {
            if (this[i] !== a[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if the address is bigger than another address
     * @returns {boolean} If bigger
     */
    public isBiggerThan(a: Address): boolean {
        for (let i = 0; i < this.length; i++) {
            if (this[i] < a[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if the address is smaller than another address
     * @returns {boolean} If smaller
     */
    public isSmallerThan(a: Address): boolean {
        for (let i = 0; i < this.length; i++) {
            if (this[i] > a[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Set the public key
     * @param {ArrayLike<number>} publicKey The public key
     * @returns {void}
     */
    public override set(publicKey: ArrayLike<number>): void {
        if (publicKey.length !== 33 && publicKey.length !== 32 && publicKey.length !== 65) {
            throw new Error('Invalid public key length');
        }

        if (publicKey.length === 32) {
            this.isP2TROnly = true;

            const buf = Buffer.alloc(32);
            buf.set(publicKey);

            super.set(publicKey);
        } else {
            this._keyPair = EcKeyPair.fromPublicKey(Uint8Array.from(publicKey));

            const tweaked = toXOnly(
                Buffer.from(
                    EcKeyPair.tweakPublicKey(this._keyPair.publicKey.toString('hex')),
                    'hex',
                ),
            );

            super.set(Uint8Array.from(tweaked));
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

        let p2trAddy: string | undefined;
        if (this._keyPair) {
            p2trAddy = EcKeyPair.getTaprootAddress(this.keyPair, network);
        } else if (this.isP2TROnly) {
            p2trAddy = EcKeyPair.tweakedPubKeyBufferToAddress(this, network);
        }

        if (p2trAddy) {
            this.#network = network;
            this.#p2tr = p2trAddy;

            return p2trAddy;
        }

        throw new Error('Public key not set');
    }
}
