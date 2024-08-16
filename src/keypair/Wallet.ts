import { IWallet } from './interfaces/IWallet.js';
import { ECPairInterface } from 'ecpair';
import { EcKeyPair } from './EcKeyPair.js';
import { Network, networks } from 'bitcoinjs-lib';
import { Address } from '@btc-vision/bsi-binary';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';

/**
 * Wallet class
 */
export class Wallet {
    /**
     * Keypair for the wallet
     * @private
     */
    private readonly _keypair: ECPairInterface;

    /**
     * P2WPKH address for the wallet
     * @private
     */
    private readonly _p2wpkh: Address;

    /**
     * P2TR address for the wallet
     * @private
     */
    private readonly _p2tr: Address;

    /**
     * Legacy address for the wallet
     * @private
     */
    private readonly _legacy: Address;

    constructor(
        wallet: IWallet,
        public readonly network: Network = networks.bitcoin,
    ) {
        this._keypair = EcKeyPair.fromWIF(wallet.privateKey, this.network);

        this._p2wpkh = EcKeyPair.getP2WPKHAddress(this._keypair, this.network);
        this._p2tr = EcKeyPair.getTaprootAddress(this._keypair, this.network);
        this._legacy = EcKeyPair.getLegacyAddress(this._keypair, this.network);
    }

    /**
     * Get the keypair for the wallet
     * @returns {ECPairInterface}
     */
    public get keypair(): ECPairInterface {
        if (!this._keypair) throw new Error('Keypair not set');

        return this._keypair;
    }

    /**
     * Get the P2WPKH address for the wallet
     * @returns {Address}
     */
    public get p2wpkh(): Address {
        return this._p2wpkh;
    }

    /**
     * Get the P2TR address for the wallet
     * @returns {Address}
     */
    public get p2tr(): Address {
        return this._p2tr;
    }

    /**
     * Get the legacy address for the wallet
     * @returns {Address}
     */
    public get legacy(): Address {
        return this._legacy;
    }

    /**
     * Get the addresses for the wallet
     * @returns {Address[]}
     */
    public get addresses(): Address[] {
        return [this.p2wpkh, this.p2tr, this.legacy];
    }

    /**
     * Get the public key for the wallet
     * @protected
     * @returns {Buffer}
     */
    public get publicKey(): Buffer {
        if (!this.keypair) throw new Error('Keypair not set');

        return this.keypair.publicKey;
    }

    /**
     * Get the x-only public key for the wallet
     * @public
     * @returns {Buffer}
     */
    public get xOnly(): Buffer {
        if (!this.keypair) throw new Error('Keypair not set');

        return toXOnly(this.keypair.publicKey);
    }

    /**
     * Create a wallet from a WIF
     * @param {string} wif The WIF
     * @param {Network} network The network
     * @returns {Wallet} The wallet
     */
    public static fromWif(wif: string, network: Network = networks.bitcoin): Wallet {
        return new Wallet({ privateKey: wif, address: '', publicKey: '' }, network);
    }
}
