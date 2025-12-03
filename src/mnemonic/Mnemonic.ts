import * as bip39 from 'bip39';
import {
    BIP32Factory,
    BIP32Interface,
    MLDSASecurityLevel,
    QuantumBIP32Factory,
    QuantumBIP32Interface,
} from '@btc-vision/bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import { initEccLib, Network, networks } from '@btc-vision/bitcoin';
import { Wallet } from '../keypair/Wallet.js';
import { MnemonicStrength } from './MnemonicStrength.js';
import { BIPStandard, buildBIPPath } from './BIPStandard.js';
import { AddressTypes } from '../keypair/AddressVerificator.js';

initEccLib(ecc);

const bip32 = BIP32Factory(ecc);

export { BIPStandard, getBIPDescription } from './BIPStandard.js';

/**
 * Mnemonic class for managing BIP39 mnemonic phrases with BIP360 quantum support
 *
 * This class provides methods to generate, validate, and derive wallets from mnemonic phrases.
 * It supports both classical Bitcoin derivation paths (BIP44, BIP84, etc.) and quantum-resistant
 * ML-DSA keys via BIP360.
 *
 * @example
 * ```typescript
 * // Generate a new mnemonic
 * const mnemonic = Mnemonic.generate();
 *
 * // Derive a wallet at index 0
 * const wallet = mnemonic.derive(0);
 *
 * // Derive multiple wallets
 * const wallets = mnemonic.deriveMultiple(5);
 *
 * // Load from existing mnemonic
 * const existingMnemonic = new Mnemonic('your twelve word mnemonic phrase here...');
 * ```
 */
export class Mnemonic {
    /**
     * The BIP39 mnemonic phrase
     */
    private readonly _phrase: string;

    /**
     * Optional BIP39 passphrase for additional security
     */
    private readonly _passphrase: string;

    /**
     * The network to use for derivation
     */
    private readonly _network: Network;

    /**
     * The ML-DSA security level for quantum keys
     */
    private readonly _securityLevel: MLDSASecurityLevel;

    /**
     * The seed derived from the mnemonic
     */
    private readonly _seed: Buffer;

    /**
     * The classical BIP32 root for Bitcoin keys
     */
    private readonly _classicalRoot: BIP32Interface;

    /**
     * The quantum BIP32 root for ML-DSA keys
     */
    private readonly _quantumRoot: QuantumBIP32Interface;

    /**
     * Create a new Mnemonic instance from an existing phrase
     *
     * @param phrase - The BIP39 mnemonic phrase (12, 15, 18, 21, or 24 words)
     * @param passphrase - Optional BIP39 passphrase for additional security (default: '')
     * @param network - The Bitcoin network to use (default: bitcoin mainnet)
     * @param securityLevel - The ML-DSA security level for quantum keys (default: LEVEL2/44)
     * @throws {Error} If the mnemonic phrase is invalid
     */
    constructor(
        phrase: string,
        passphrase: string = '',
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
    ) {
        if (!bip39.validateMnemonic(phrase)) {
            throw new Error('Invalid mnemonic phrase');
        }

        this._phrase = phrase;
        this._passphrase = passphrase;
        this._network = network;
        this._securityLevel = securityLevel;

        // Derive the seed from the mnemonic
        this._seed = bip39.mnemonicToSeedSync(this._phrase, this._passphrase);

        // Create the classical BIP32 root
        this._classicalRoot = bip32.fromSeed(this._seed, this._network);

        // Create the quantum BIP32 root with network parameter
        this._quantumRoot = QuantumBIP32Factory.fromSeed(
            this._seed,
            this._network,
            this._securityLevel,
        );
    }

    /**
     * Get the mnemonic phrase
     *
     * @warning This phrase is highly sensitive and can be used to derive all keys in the wallet.
     * Handle with extreme care, never log or transmit insecurely, and store only in secure environments.
     *
     * @returns The BIP39 mnemonic phrase
     */
    public get phrase(): string {
        return this._phrase;
    }

    /**
     * Get the network
     */
    public get network(): Network {
        return this._network;
    }

    /**
     * Get the ML-DSA security level
     */
    public get securityLevel(): MLDSASecurityLevel {
        return this._securityLevel;
    }

    /**
     * Get the seed derived from the mnemonic phrase
     *
     * @warning This seed is highly sensitive and can be used to derive all keys in the wallet.
     * Handle with extreme care, never log or transmit insecurely, and store only in secure environments.
     *
     * @returns A copy of the seed buffer to prevent external modification
     */
    public get seed(): Buffer {
        return Buffer.from(this._seed);
    }

    /**
     * Generate a new mnemonic phrase
     *
     * @param strength - The entropy strength in bits (default: 256 for 24 words)
     * @returns A new random mnemonic phrase
     */
    public static generatePhrase(strength: MnemonicStrength = MnemonicStrength.MAXIMUM): string {
        return bip39.generateMnemonic(strength);
    }

    /**
     * Generate a new Mnemonic instance with a random phrase
     *
     * @param strength - The entropy strength in bits (default: 256 for 24 words)
     * @param passphrase - Optional BIP39 passphrase for additional security (default: '')
     * @param network - The Bitcoin network to use (default: bitcoin mainnet)
     * @param securityLevel - The ML-DSA security level for quantum keys (default: LEVEL2/44)
     * @returns A new Mnemonic instance
     */
    public static generate(
        strength: MnemonicStrength = MnemonicStrength.MAXIMUM,
        passphrase: string = '',
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
    ): Mnemonic {
        const phrase = bip39.generateMnemonic(strength);
        return new Mnemonic(phrase, passphrase, network, securityLevel);
    }

    /**
     * Validate a mnemonic phrase
     *
     * @param phrase - The mnemonic phrase to validate
     * @returns True if the phrase is valid, false otherwise
     */
    public static validate(phrase: string): boolean {
        return bip39.validateMnemonic(phrase);
    }

    /**
     * Derive a wallet at a specific index using BIP360 (quantum) and configurable BIP standard (classical) paths
     *
     * This method derives both classical ECDSA/Schnorr keys and quantum-resistant ML-DSA keys
     * for the wallet, providing hybrid post-quantum security.
     *
     * @param index - The address index to derive (default: 0)
     * @param account - The account index (default: 0)
     * @param isChange - Whether this is a change address (default: false)
     * @param bipStandard - The BIP standard to use for classical derivation (default: BIP84)
     * @returns A Wallet instance with both classical and quantum keys
     *
     * @example
     * ```typescript
     * // Default: BIP84 (Native SegWit)
     * const wallet1 = mnemonic.derive(0);
     *
     * // BIP44 (Compatible with Unisat)
     * const wallet2 = mnemonic.derive(0, 0, false, BIPStandard.BIP44);
     *
     * // BIP86 (Taproot)
     * const wallet3 = mnemonic.derive(0, 0, false, BIPStandard.BIP86);
     * ```
     */
    public derive(
        index: number = 0,
        account: number = 0,
        isChange: boolean = false,
        bipStandard: BIPStandard = BIPStandard.BIP84,
    ): Wallet {
        // Derive classical key using specified BIP standard
        const classicalPath = this.buildClassicalPath(account, index, isChange, bipStandard);
        const classicalChild = this._classicalRoot.derivePath(classicalPath);

        if (!classicalChild.privateKey) {
            throw new Error(`Failed to derive classical private key at index ${index}`);
        }

        // Derive quantum key using BIP360
        const quantumPath = this.buildQuantumPath(account, index, isChange);
        const quantumChild = this._quantumRoot.derivePath(quantumPath);

        if (!quantumChild.privateKey) {
            throw new Error(`Failed to derive quantum private key at index ${index}`);
        }

        // Create a wallet with both keys
        return new Wallet(
            Buffer.from(classicalChild.privateKey).toString('hex'),
            Buffer.from(quantumChild.privateKey).toString('hex'),
            this._network,
            this._securityLevel,
            Buffer.from(this._quantumRoot.chainCode),
        );
    }

    /**
     * Derive a Unisat-compatible wallet
     *
     * Unisat uses different derivation paths based on address type:
     * - Legacy (P2PKH): m/44'/coinType'/account'/change/index
     * - Nested SegWit (P2SH-P2WPKH): m/49'/coinType'/account'/change/index
     * - Native SegWit (P2WPKH): m/84'/coinType'/account'/change/index
     * - Taproot (P2TR): m/86'/coinType'/account'/change/index
     *
     * @param addressType - The address type to generate
     * @param index - The address index (default: 0)
     * @param account - The account index (default: 0)
     * @param isChange - Whether this is a change address (default: false)
     * @returns A Wallet instance with both classical and quantum keys
     */
    public deriveUnisat(
        addressType: AddressTypes = AddressTypes.P2TR,
        index: number = 0,
        account: number = 0,
        isChange: boolean = false,
    ): Wallet {
        // Determine BIP purpose based on address type
        let purpose: number;
        switch (addressType) {
            case AddressTypes.P2PKH:
                purpose = 44;
                break;
            case AddressTypes.P2SH_OR_P2SH_P2WPKH:
                purpose = 49;
                break;
            case AddressTypes.P2WPKH:
                purpose = 84;
                break;
            case AddressTypes.P2TR:
                purpose = 86;
                break;
            default:
                throw new Error(`Unsupported address type: ${addressType}`);
        }

        // Build classical derivation path for Unisat
        const coinType = this.getCoinType();
        const change = isChange ? 1 : 0;
        const classicalPath = `m/${purpose}'/0'/${account}'/${change}/${index}`;

        // Derive classical key
        const classicalChild = this._classicalRoot.derivePath(classicalPath);

        if (!classicalChild.privateKey) {
            throw new Error(`Failed to derive classical private key at path ${classicalPath}`);
        }

        // Derive quantum key using BIP360
        const quantumPath = `m/360'/${coinType}'/${account}'/${change}/${index}`;
        const quantumChild = this._quantumRoot.derivePath(quantumPath);

        if (!quantumChild.privateKey) {
            throw new Error(`Failed to derive quantum private key at path ${quantumPath}`);
        }

        // Create wallet with both classical and quantum keys
        return new Wallet(
            Buffer.from(classicalChild.privateKey).toString('hex'),
            Buffer.from(quantumChild.privateKey).toString('hex'),
            this._network,
            this._securityLevel,
            Buffer.from(this._quantumRoot.chainCode),
        );
    }

    /**
     * Derive multiple Unisat-compatible wallets
     *
     * @param addressType - The address type to generate
     * @param count - Number of wallets to derive
     * @param startIndex - Starting index (default: 0)
     * @param account - The account index (default: 0)
     * @param isChange - Whether these are change addresses (default: false)
     * @returns Array of Wallet instances
     */
    public deriveMultipleUnisat(
        addressType: AddressTypes = AddressTypes.P2TR,
        count: number = 5,
        startIndex: number = 0,
        account: number = 0,
        isChange: boolean = false,
    ): Wallet[] {
        const wallets: Wallet[] = [];

        for (let i = 0; i < count; i++) {
            wallets.push(this.deriveUnisat(addressType, startIndex + i, account, isChange));
        }

        return wallets;
    }

    /**
     * Derive multiple wallets with sequential indices
     *
     * @param count - The number of wallets to derive
     * @param startIndex - The starting address index (default: 0)
     * @param account - The account index (default: 0)
     * @param isChange - Whether these are change addresses (default: false)
     * @param bipStandard - The BIP standard to use for classical derivation (default: BIP84)
     * @returns An array of Wallet instances
     */
    public deriveMultiple(
        count: number,
        startIndex: number = 0,
        account: number = 0,
        isChange: boolean = false,
        bipStandard: BIPStandard = BIPStandard.BIP84,
    ): Wallet[] {
        const wallets: Wallet[] = [];

        for (let i = 0; i < count; i++) {
            wallets.push(this.derive(startIndex + i, account, isChange, bipStandard));
        }

        return wallets;
    }

    /**
     * Derive a wallet using a custom derivation path
     *
     * @param classicalPath - The BIP32 path for classical keys (e.g., "m/84'/0'/0'/0/0")
     * @param quantumPath - The BIP360 path for quantum keys (e.g., "m/360'/0'/0'/0/0")
     * @returns A Wallet instance
     */
    public deriveCustomPath(classicalPath: string, quantumPath: string): Wallet {
        const classicalChild = this._classicalRoot.derivePath(classicalPath);
        const quantumChild = this._quantumRoot.derivePath(quantumPath);

        if (!classicalChild.privateKey) {
            throw new Error(`Failed to derive classical private key at path ${classicalPath}`);
        }

        if (!quantumChild.privateKey) {
            throw new Error(`Failed to derive quantum private key at path ${quantumPath}`);
        }

        // Create wallet with both classical and ML-DSA private keys
        return new Wallet(
            Buffer.from(classicalChild.privateKey).toString('hex'),
            Buffer.from(quantumChild.privateKey).toString('hex'),
            this._network,
            this._securityLevel,
            Buffer.from(this._quantumRoot.chainCode),
        );
    }

    /**
     * Get the classical BIP32 root
     *
     * @returns The classical BIP32Interface for manual derivation
     */
    public getClassicalRoot(): BIP32Interface {
        return this._classicalRoot;
    }

    /**
     * Get the quantum BIP32 root
     *
     * @returns The quantum BIP32Interface for manual derivation
     */
    public getQuantumRoot(): QuantumBIP32Interface {
        return this._quantumRoot;
    }

    /**
     * Build a classical derivation path using specified BIP standard
     *
     * @param account - The account index
     * @param index - The address index
     * @param isChange - Whether this is a change address
     * @param bipStandard - The BIP standard to use (default: BIP84)
     * @returns The derivation path string
     */
    private buildClassicalPath(
        account: number,
        index: number,
        isChange: boolean,
        bipStandard: BIPStandard = BIPStandard.BIP84,
    ): string {
        const coinType = this.getCoinType();
        const change = isChange ? 1 : 0;
        return buildBIPPath(bipStandard, coinType, account, change, index);
    }

    /**
     * Build a quantum derivation path (BIP360)
     *
     * @param account - The account index
     * @param index - The address index
     * @param isChange - Whether this is a change address
     * @returns The derivation path string
     */
    private buildQuantumPath(account: number, index: number, isChange: boolean): string {
        const coinType = this.getCoinType();
        const change = isChange ? 1 : 0;
        return `m/360'/${coinType}'/${account}'/${change}/${index}`;
    }

    /**
     * Get the coin type based on the network
     *
     * @returns The coin type (0 for mainnet, 1 for testnet/regtest)
     */
    private getCoinType(): number {
        if (
            this._network.bech32 === networks.testnet.bech32 ||
            this._network.bech32 === networks.regtest.bech32
        ) {
            return 1;
        }
        return 0;
    }
}
