import { ECPairInterface } from 'ecpair';
import { EcKeyPair } from './EcKeyPair.js';
import { initEccLib, Network, networks, toXOnly } from '@btc-vision/bitcoin';
import { Address } from './Address.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';
import { IP2WSHAddress } from '../transaction/mineable/IP2WSHAddress.js';
import * as ecc from '@bitcoinerlab/secp256k1';
import {
    getMLDSAConfig,
    MLDSASecurityLevel,
    QuantumBIP32Factory,
    QuantumBIP32Interface,
} from '@btc-vision/bip32';
import { randomBytes } from 'crypto';

initEccLib(ecc);

/**
 * Wallet class for managing both classical and quantum-resistant keys
 *
 * This class represents a wallet with both ECDSA/Schnorr keys (for classical Bitcoin transactions)
 * and ML-DSA keys (for quantum-resistant security). It can be created from private keys, WIF strings,
 * or generated randomly.
 *
 * @example
 * ```typescript
 * // Create from private keys
 * const wallet = new Wallet(classicalPrivateKey, mldsaPrivateKey);
 *
 * // Generate a new random wallet
 * const newWallet = Wallet.generate();
 *
 * // Create from WIF
 * const walletFromWif = Wallet.fromWif(wif, quantumWif);
 *
 * // Export keys
 * const classicalWif = wallet.toWIF();
 * const quantumHex = wallet.quantumPrivateKeyHex;
 * ```
 */
export class Wallet {
    /**
     * Classical ECDSA/Schnorr keypair for the wallet
     */
    private readonly _keypair: ECPairInterface;

    /**
     * Quantum ML-DSA keypair for the wallet
     */
    private readonly _mldsaKeypair: QuantumBIP32Interface;

    /**
     * The ML-DSA security level used
     */
    private readonly _securityLevel: MLDSASecurityLevel;

    /**
     * Chain code for BIP32 derivation (if applicable)
     */
    private readonly _chainCode: Buffer;

    /**
     * P2WPKH address for the wallet
     */
    private readonly _p2wpkh: string;

    /**
     * P2TR (Taproot) address for the wallet
     */
    private readonly _p2tr: string;

    /**
     * P2WDA (Pay-to-Witness-Data-Authentication) address
     */
    private readonly _p2wda: IP2WSHAddress;

    /**
     * Legacy P2PKH address for the wallet
     */
    private readonly _legacy: string;

    /**
     * Legacy SegWit (P2SH-P2WPKH) address for the wallet
     */
    private readonly _segwitLegacy: string;

    /**
     * Classical public key buffer
     */
    private readonly _bufferPubKey: Buffer;

    /**
     * Tweaked key for Taproot
     */
    private readonly _tweakedKey: Buffer;

    /**
     * Address corresponding to the wallet
     */
    private readonly _address: Address;

    /**
     * Create a new Wallet instance
     *
     * @param privateKeyOrWif - Classical private key (hex or WIF format)
     * @param mldsaPrivateKeyOrBase58 - ML-DSA private key (hex format) or full base58 extended key
     * @param network - The Bitcoin network to use (default: bitcoin mainnet)
     * @param securityLevel - The ML-DSA security level (default: LEVEL2/44)
     * @param chainCode - Optional chain code for BIP32 derivation (32 bytes)
     * @throws {Error} If the private keys are invalid
     */
    constructor(
        privateKeyOrWif: string,
        mldsaPrivateKeyOrBase58: string,
        public readonly network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
        chainCode?: Buffer,
    ) {
        this._securityLevel = securityLevel;

        // Parse classical private key
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

        // Parse ML-DSA private key
        const parsedMLDSAKey = mldsaPrivateKeyOrBase58.startsWith('0x')
            ? mldsaPrivateKeyOrBase58.replace('0x', '')
            : mldsaPrivateKeyOrBase58;

        // Check if it's a base58 extended key
        if (BitcoinUtils.isValidHex(parsedMLDSAKey)) {
            // It's a raw hex private key (possibly with public key concatenated)
            const mldsaBuffer = Buffer.from(parsedMLDSAKey, 'hex');

            // Get expected lengths for this security level and network
            const config = getMLDSAConfig(securityLevel, this.network);
            const privateKeySize = config.privateKeySize;
            const publicKeySize = config.publicKeySize;
            const combinedSize = privateKeySize + publicKeySize;

            let mldsaPrivateKeyBuffer: Buffer;

            // Check if it's just the private key, or private+public combined
            if (mldsaBuffer.length === privateKeySize) {
                // Just the private key
                mldsaPrivateKeyBuffer = mldsaBuffer;
            } else if (mldsaBuffer.length === combinedSize) {
                // Combined privateKey || publicKey format (from Mnemonic.derive)
                // Extract just the private key portion
                mldsaPrivateKeyBuffer = mldsaBuffer.subarray(0, privateKeySize);
            } else {
                throw new Error(
                    `Invalid ML-DSA key length for security level ${securityLevel}. Expected ${privateKeySize} bytes (private only) or ${combinedSize} bytes (private+public), got ${mldsaBuffer.length} bytes.`,
                );
            }

            // Use provided chain code or generate a random one
            if (chainCode && chainCode.length !== 32) {
                throw new Error('Chain code must be 32 bytes');
            }
            this._chainCode = chainCode || randomBytes(32);

            // Create QuantumBIP32Interface from private key and chain code
            // Pass network to ensure network-specific derivation
            this._mldsaKeypair = QuantumBIP32Factory.fromPrivateKey(
                mldsaPrivateKeyBuffer,
                this._chainCode,
                this.network,
                securityLevel,
            );
        } else {
            this._mldsaKeypair = QuantumBIP32Factory.fromBase58(parsedMLDSAKey);
            this._chainCode = Buffer.from(this._mldsaKeypair.chainCode);
            this._securityLevel = this._mldsaKeypair.securityLevel;
        }

        // Set up addresses
        this._bufferPubKey = this._keypair.publicKey;
        this._address = new Address(this._mldsaKeypair.publicKey, this._keypair.publicKey);

        this._p2tr = this._address.p2tr(this.network);
        this._p2wpkh = this._address.p2wpkh(this.network);
        this._legacy = this._address.p2pkh(this.network);
        this._segwitLegacy = this._address.p2shp2wpkh(this.network);
        this._p2wda = this._address.p2wda(this.network);

        this._tweakedKey = this._address.tweakedPublicKeyToBuffer();
    }

    /**
     * Get the address for the wallet
     */
    public get address(): Address {
        return this._address;
    }

    /**
     * Get the tweaked public key for Taproot
     */
    public get tweakedPubKeyKey(): Buffer {
        return this._tweakedKey;
    }

    /**
     * Get the classical keypair for the wallet
     */
    public get keypair(): ECPairInterface {
        if (!this._keypair) throw new Error('Keypair not set');
        return this._keypair;
    }

    /**
     * Get the quantum ML-DSA keypair
     */
    public get mldsaKeypair(): QuantumBIP32Interface {
        return this._mldsaKeypair;
    }

    /**
     * Get the ML-DSA security level
     */
    public get securityLevel(): MLDSASecurityLevel {
        return this._securityLevel;
    }

    /**
     * Get the chain code for BIP32 derivation
     */
    public get chainCode(): Buffer {
        return this._chainCode;
    }

    /**
     * Get the P2WPKH (Native SegWit) address
     */
    public get p2wpkh(): string {
        return this._p2wpkh;
    }

    /**
     * Get the P2TR (Taproot) address
     */
    public get p2tr(): string {
        return this._p2tr;
    }

    /**
     * Get the P2WDA address
     */
    public get p2wda(): IP2WSHAddress {
        return this._p2wda;
    }

    /**
     * Get the legacy P2PKH address
     */
    public get legacy(): string {
        return this._legacy;
    }

    /**
     * Get all addresses for the wallet
     */
    public get addresses(): string[] {
        return [this.p2wpkh, this.p2tr, this.legacy, this.segwitLegacy];
    }

    /**
     * Get the legacy SegWit (P2SH-P2WPKH) address
     */
    public get segwitLegacy(): string {
        return this._segwitLegacy;
    }

    /**
     * Get the classical public key
     */
    public get publicKey(): Buffer {
        if (!this._bufferPubKey) throw new Error('Public key not set');
        return this._bufferPubKey;
    }

    /**
     * Get the quantum ML-DSA public key
     */
    public get quantumPublicKey(): Buffer {
        return Buffer.from(this._mldsaKeypair.publicKey);
    }

    /**
     * Get the quantum ML-DSA private key
     */
    public get quantumPrivateKey(): Buffer {
        if (!this._mldsaKeypair.privateKey) {
            throw new Error('Quantum private key not set');
        }

        return Buffer.from(this._mldsaKeypair.privateKey);
    }

    /**
     * Get the quantum ML-DSA public key as hex string
     */
    public get quantumPublicKeyHex(): string {
        return Buffer.from(this._mldsaKeypair.publicKey).toString('hex');
    }

    /**
     * Get the quantum ML-DSA private key as hex string
     */
    public get quantumPrivateKeyHex(): string {
        if (!this._mldsaKeypair.privateKey) {
            throw new Error('Quantum private key not set');
        }

        return Buffer.from(this._mldsaKeypair.privateKey).toString('hex');
    }

    /**
     * Get the x-only public key for Taproot
     */
    public get xOnly(): Buffer {
        if (!this.keypair) throw new Error('Keypair not set');
        return toXOnly(this._bufferPubKey);
    }

    /**
     * Create a wallet from WIF strings
     *
     * @param wif - The classical WIF private key
     * @param quantumPrivateKeyHex - The quantum ML-DSA private key (hex)
     * @param network - The network (default: bitcoin mainnet)
     * @param securityLevel - The ML-DSA security level (default: LEVEL2/44)
     * @param chainCode - Optional chain code for BIP32 derivation
     * @returns A Wallet instance
     */
    public static fromWif(
        wif: string,
        quantumPrivateKeyHex: string,
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
        chainCode?: Buffer,
    ): Wallet {
        return new Wallet(wif, quantumPrivateKeyHex, network, securityLevel, chainCode);
    }

    /**
     * Generate a new random wallet with both classical and quantum keys
     *
     * @param network - The network (default: bitcoin mainnet)
     * @param securityLevel - The ML-DSA security level (default: LEVEL2/44)
     * @returns A new Wallet instance with randomly generated keys
     */
    public static generate(
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
    ): Wallet {
        const walletData = EcKeyPair.generateWallet(network, securityLevel);

        if (!walletData.quantumPrivateKey) {
            throw new Error('Failed to generate quantum keys');
        }

        return new Wallet(
            walletData.privateKey,
            walletData.quantumPrivateKey,
            network,
            securityLevel,
        );
    }

    /**
     * Create a wallet from private key hex strings
     *
     * @param privateKeyHexOrWif - The classical private key
     * @param mldsaPrivateKeyOrBase58 - The quantum ML-DSA private key
     * @param network - The network (default: bitcoin mainnet)
     * @param securityLevel - The ML-DSA security level (default: LEVEL2/44)
     * @param chainCode - Optional chain code for BIP32 derivation
     * @returns A Wallet instance
     */
    public static fromPrivateKeys(
        privateKeyHexOrWif: string,
        mldsaPrivateKeyOrBase58: string,
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
        chainCode?: Buffer,
    ): Wallet {
        return new Wallet(
            privateKeyHexOrWif,
            mldsaPrivateKeyOrBase58,
            network,
            securityLevel,
            chainCode,
        );
    }

    /**
     * Export the classical private key as WIF
     *
     * @returns The WIF-encoded private key
     */
    public toWIF(): string {
        return this._keypair.toWIF();
    }

    /**
     * Export the classical private key as hex
     *
     * @returns The hex-encoded private key
     */
    public toPrivateKeyHex(): string {
        if (!this._keypair.privateKey) {
            throw new Error('Private key not available');
        }
        return this._keypair.privateKey.toString('hex');
    }

    /**
     * Export the classical public key as hex
     *
     * @returns The hex-encoded public key
     */
    public toPublicKeyHex(): string {
        return this._bufferPubKey.toString('hex');
    }

    /**
     * Export quantum keypair as base58 extended key
     *
     * @returns The base58-encoded extended quantum key
     */
    public toQuantumBase58(): string {
        return this._mldsaKeypair.toBase58();
    }

    /**
     * Derive a child wallet using BIP32 path
     *
     * @param path - BIP32 derivation path (e.g., "m/0'/0/0")
     * @returns A new Wallet instance derived from this wallet
     * @throws {Error} If the private key is not available for derivation
     */
    public derivePath(path: string): Wallet {
        // Derive quantum key
        const derivedQuantum = this._mldsaKeypair.derivePath(path);

        // Derive classical key using BIP32
        if (!this._keypair.privateKey) {
            throw new Error('Cannot derive from a watch-only wallet (no private key available)');
        }

        // Create BIP32 node from current private key and chain code
        const bip32Root = EcKeyPair.BIP32.fromPrivateKey(
            this._keypair.privateKey,
            this._chainCode,
            this.network,
        );

        // Derive the child key using the provided path
        const derivedClassical = bip32Root.derivePath(path);
        if (!derivedClassical.privateKey) {
            throw new Error('Failed to derive classical private key');
        }

        if (!derivedClassical.chainCode) {
            throw new Error('Failed to derive classical chain code');
        }

        // Create new wallet from derived keys
        // Pass the derived chain code so the child wallet can derive further children
        return new Wallet(
            Buffer.from(derivedClassical.privateKey).toString('hex'),
            derivedQuantum.toBase58(),
            this.network,
            this._securityLevel,
            Buffer.from(derivedClassical.chainCode),
        );
    }
}
