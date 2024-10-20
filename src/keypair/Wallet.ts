import { IWallet } from './interfaces/IWallet.js';
import { ECPairInterface } from 'ecpair';
import { EcKeyPair } from './EcKeyPair.js';
import { Network, networks } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { Address } from './Address.js';

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
    private readonly _p2wpkh: string;

    /**
     * P2TR address for the wallet
     * @private
     */
    private readonly _p2tr: string;

    /**
     * Legacy address for the wallet
     * @private
     */
    private readonly _legacy: string;

    /**
     * Legacy address for the wallet
     * @private
     */
    private readonly _segwitLegacy: string;

    /**
     * Buffer public key
     * @private
     */
    private readonly _bufferPubKey: Buffer;

    /**
     * Tweaked key
     * @private
     */
    private readonly _tweakedKey: Buffer;

    /**
     * Address corresponding to the wallet
     * @private
     */
    private readonly _address: Address;

    constructor(
        wallet: IWallet,
        public readonly network: Network = networks.bitcoin,
    ) {
        this._keypair = EcKeyPair.fromWIF(wallet.privateKey, this.network);

        this._p2wpkh = EcKeyPair.getP2WPKHAddress(this._keypair, this.network);
        this._p2tr = EcKeyPair.getTaprootAddress(this._keypair, this.network);
        this._legacy = EcKeyPair.getLegacyAddress(this._keypair, this.network);
        this._segwitLegacy = EcKeyPair.getLegacySegwitAddress(this._keypair, this.network);

        this._tweakedKey = Buffer.from(
            EcKeyPair.tweakPublicKey(this._keypair.publicKey.toString('hex')),
            'hex',
        );

        this._bufferPubKey = this._keypair.publicKey;
        this._address = new Address(this._keypair.publicKey);
    }

    /**
     * Get the address for the wallet
     * @returns {Address}
     */
    public get address(): Address {
        return this._address;
    }

    /**
     * Get the tweaked key
     * @returns {Buffer}
     */
    public get tweakedPubKeyKey(): Buffer {
        return this._tweakedKey;
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
     * @returns {string}
     */
    public get p2wpkh(): string {
        return this._p2wpkh;
    }

    /**
     * Get the P2TR address for the wallet
     * @returns {string}
     */
    public get p2tr(): string {
        return this._p2tr;
    }

    /**
     * Get the legacy address for the wallet
     * @returns {string}
     */
    public get legacy(): string {
        return this._legacy;
    }

    /**
     * Get the addresses for the wallet
     * @returns {Address[]}
     */
    public get addresses(): string[] {
        return [this.p2wpkh, this.p2tr, this.legacy, this.segwitLegacy];
    }

    /**
     * Get the segwit legacy address for the wallet
     * @returns {string}
     */
    public get segwitLegacy(): string {
        return this._segwitLegacy;
    }

    /**
     * Get the public key for the wallet
     * @protected
     * @returns {Buffer}
     */
    public get publicKey(): Buffer {
        if (!this._bufferPubKey) throw new Error('Public key not set');

        return this._bufferPubKey;
    }

    /**
     * Get the x-only public key for the wallet
     * @public
     * @returns {Buffer}
     */
    public get xOnly(): Buffer {
        if (!this.keypair) throw new Error('Keypair not set');

        return toXOnly(this._bufferPubKey);
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
