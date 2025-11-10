import { ECPairInterface } from 'ecpair';
import { EcKeyPair } from './EcKeyPair.js';
import { initEccLib, Network, networks, toXOnly } from '@btc-vision/bitcoin';
import { Address } from './Address.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';
import { IP2WSHAddress } from '../transaction/mineable/IP2WSHAddress.js';
import * as bip39 from 'bip39';
import { BIP32Factory, BIP32Interface } from '@btc-vision/bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import { DerivationPath } from '../derivation/DerivationPath.js';

initEccLib(ecc);

const bip32 = BIP32Factory(ecc);

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
     * P2WDA Pay-to-Witness-Data-Authentication
     * @private
     */
    private readonly _p2wda: IP2WSHAddress;

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
        privateKeyOrWif: string,
        public readonly network: Network = networks.bitcoin,
    ) {
        const parsedPrivateKey = privateKeyOrWif.startsWith('0x')
            ? privateKeyOrWif.replace('0x', '')
            : privateKeyOrWif;

        if (BitcoinUtils.isValidHex(parsedPrivateKey)) {
            this._keypair = EcKeyPair.fromPrivateKey(
                Buffer.from(parsedPrivateKey, 'hex'),
                this.network,
            );
        } else {
            this._keypair = EcKeyPair.fromWIF(parsedPrivateKey, this.network);
        }

        this._bufferPubKey = this._keypair.publicKey;
        this._address = new Address(this._keypair.publicKey);

        this._p2tr = this._address.p2tr(this.network);
        this._p2wpkh = this._address.p2wpkh(this.network);
        this._legacy = this._address.p2pkh(this.network);
        this._segwitLegacy = this._address.p2wpkh(this.network);
        this._p2wda = this._address.p2wda(this.network);

        this._tweakedKey = this._address.toBuffer();
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
     * Get the P2WDA address for the wallet
     * @returns {string}
     */
    public get p2wda(): IP2WSHAddress {
        return this._p2wda;
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
        return new Wallet(wif, network);
    }

    /**
     * Create a new fresh wallet
     * @param {Network} network The network
     */
    public static new(network: Network = networks.bitcoin): Wallet {
        return new Wallet(EcKeyPair.generateWallet(network).privateKey, network);
    }

    /**
     * Create a wallet from mnemonic seed phrase
     * @param {string} mnemonic The BIP39 mnemonic seed phrase
     * @param {Network} network The network (default: bitcoin mainnet)
     * @param {DerivationPath | string} derivationPath The derivation path (default: BIP84 for native segwit)
     * @param {string} passphrase Optional BIP39 passphrase for additional security
     * @returns {Wallet} The wallet instance
     */
    public static fromMnemonic(
        mnemonic: string,
        network: Network = networks.bitcoin,
        derivationPath: DerivationPath | string = DerivationPath.BIP84,
        passphrase: string = '',
    ): Wallet {
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error('Invalid mnemonic seed phrase');
        }

        const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
        const root = bip32.fromSeed(seed, network);

        // Ensure path is a string
        const path: string = derivationPath satisfies string;

        const adjustedPath: string =
            network.bech32 === networks.testnet.bech32 || network.bech32 === networks.regtest.bech32
                ? path.replace("'/0'", "'/1'")
                : path;

        const child = root.derivePath(adjustedPath);

        if (!child.privateKey) {
            throw new Error('Failed to derive private key from mnemonic');
        }

        return new Wallet(child.privateKey.toString('hex'), network);
    }

    /**
     * Create multiple wallets from mnemonic with sequential account indices
     * @param {string} mnemonic The BIP39 mnemonic seed phrase
     * @param {number} count Number of wallets to generate
     * @param {Network} network The network (default: bitcoin mainnet)
     * @param {DerivationPath | string} basePath The base derivation path (default: BIP84)
     * @param {string} passphrase Optional BIP39 passphrase
     * @returns {Wallet[]} Array of wallet instances
     */
    public static fromMnemonicMultiple(
        mnemonic: string,
        count: number,
        network: Network = networks.bitcoin,
        basePath: DerivationPath | string = DerivationPath.BIP84,
        passphrase: string = '',
    ): Wallet[] {
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error('Invalid mnemonic seed phrase');
        }

        const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
        const root = bip32.fromSeed(seed, network);
        const wallets: Wallet[] = [];

        for (let i = 0; i < count; i++) {
            // Ensure path is a string
            const path: string = basePath satisfies string;
            const adjustedPath: string =
                network.bech32 === networks.testnet.bech32 ||
                network.bech32 === networks.regtest.bech32
                    ? path.replace("'/0'", "'/1'").replace(/\/0\/\d+$/, `/0/${i}`)
                    : path.replace(/\/0\/\d+$/, `/0/${i}`);

            const child = root.derivePath(adjustedPath);

            if (!child.privateKey) {
                throw new Error(`Failed to derive private key for index ${i}`);
            }

            wallets.push(new Wallet(child.privateKey.toString('hex'), network));
        }

        return wallets;
    }

    /**
     * Generate a new mnemonic seed phrase
     * @param {128 | 160 | 192 | 224 | 256} strength Entropy strength in bits (default: 256 for 24 words)
     * @returns {string} The generated mnemonic seed phrase
     */
    public static generateMnemonic(strength: 128 | 160 | 192 | 224 | 256 = 256): string {
        return bip39.generateMnemonic(strength);
    }

    /**
     * Validate a mnemonic seed phrase
     * @param {string} mnemonic The mnemonic to validate
     * @returns {boolean} True if valid, false otherwise
     */
    public static validateMnemonic(mnemonic: string): boolean {
        return bip39.validateMnemonic(mnemonic);
    }

    /**
     * Create HD wallet instance for deriving multiple addresses
     * @param {string} mnemonic The BIP39 mnemonic seed phrase
     * @param {Network} network The network
     * @param {string} passphrase Optional BIP39 passphrase
     * @returns {BIP32Interface} HD wallet root for further derivation
     */
    public static getHDRoot(
        mnemonic: string,
        network: Network = networks.bitcoin,
        passphrase: string = '',
    ): BIP32Interface {
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error('Invalid mnemonic seed phrase');
        }

        const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
        return bip32.fromSeed(seed, network);
    }
}
