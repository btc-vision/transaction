import { Network } from 'bitcoinjs-lib';
import { EcKeyPair } from './EcKeyPair.js';
import { ECPairInterface } from 'ecpair';
import { ADDRESS_BYTE_LENGTH } from '../utils/types.js';
import { AddressVerificator } from './AddressVerificator.js';

export class Address extends Uint8Array {
    private isP2TROnly: boolean = false;

    public constructor(bytes?: ArrayLike<number>) {
        super(ADDRESS_BYTE_LENGTH);

        if (!bytes) {
            return;
        }

        if (bytes.length !== ADDRESS_BYTE_LENGTH) {
            throw new Error('Invalid address length');
        }

        this.set(bytes);
    }

    private _keyPair: ECPairInterface | undefined;

    /**
     * Get the key pair for the address
     */
    public get keyPair(): ECPairInterface {
        if (!this._keyPair) {
            throw new Error('Public key not set');
        }

        return this._keyPair;
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
     * Set the public key
     * @param {ArrayLike<number>} publicKey The public key
     * @returns {void}
     */
    public override set(publicKey: ArrayLike<number>): void {
        if (publicKey.length !== 33 && publicKey.length !== 32 && publicKey.length !== 130) {
            throw new Error('Invalid public key length');
        }

        super.set(publicKey);

        if (publicKey.length === 32) {
            this.isP2TROnly = true;
        } else {
            this._keyPair = EcKeyPair.fromPublicKey(this);
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
     * Get the address in p2tr format
     * @param {Network} network The network
     */
    public p2tr(network: Network): string {
        if (this._keyPair) {
            return EcKeyPair.getTaprootAddress(this.keyPair, network);
        } else if (this.isP2TROnly) {
            return EcKeyPair.tweakedPubKeyBufferToAddress(this, network);
        }

        throw new Error('Public key not set');
    }
}
