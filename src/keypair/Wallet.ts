import { type UniversalSigner } from '@btc-vision/ecpair';
import { EcKeyPair } from './EcKeyPair.js';
import { fromHex, type Network, networks, type PublicKey, toHex, toXOnly, } from '@btc-vision/bitcoin';
import { Address } from './Address.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';
import type { IP2WSHAddress } from '../transaction/mineable/IP2WSHAddress.js';
import {
    getMLDSAConfig,
    MLDSASecurityLevel,
    QuantumBIP32Factory,
    type QuantumBIP32Interface,
} from '@btc-vision/bip32';

/**
 * Wallet class for managing both classical and quantum-resistant keys
 */
export class Wallet implements Disposable {
    private readonly _keypair: UniversalSigner;
    private readonly _mldsaKeypair: QuantumBIP32Interface;
    private readonly _securityLevel: MLDSASecurityLevel;
    private readonly _chainCode: Uint8Array;
    private readonly _p2wpkh: string;
    private readonly _p2tr: string;
    private readonly _p2wda: IP2WSHAddress;
    private readonly _legacy: string;
    private readonly _segwitLegacy: string;
    private readonly _bufferPubKey: Uint8Array;
    private readonly _tweakedKey: Uint8Array;
    private readonly _address: Address;

    constructor(
        privateKeyOrWif: string,
        mldsaPrivateKeyOrBase58: string,
        public readonly network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
        chainCode?: Uint8Array,
    ) {
        this._securityLevel = securityLevel;

        const parsedPrivateKey = privateKeyOrWif.startsWith('0x')
            ? privateKeyOrWif.slice(2)
            : privateKeyOrWif;

        if (BitcoinUtils.isValidHex(parsedPrivateKey)) {
            this._keypair = EcKeyPair.fromPrivateKey(fromHex(parsedPrivateKey), this.network);
        } else {
            this._keypair = EcKeyPair.fromWIF(parsedPrivateKey, this.network);
        }

        const parsedMLDSAKey = mldsaPrivateKeyOrBase58.startsWith('0x')
            ? mldsaPrivateKeyOrBase58.slice(2)
            : mldsaPrivateKeyOrBase58;

        if (BitcoinUtils.isValidHex(parsedMLDSAKey)) {
            const mldsaBuffer = fromHex(parsedMLDSAKey);

            const config = getMLDSAConfig(securityLevel, this.network);
            const privateKeySize = config.privateKeySize;
            const publicKeySize = config.publicKeySize;
            const combinedSize = privateKeySize + publicKeySize;

            let mldsaPrivateKeyBuffer: Uint8Array;

            if (mldsaBuffer.length === privateKeySize) {
                mldsaPrivateKeyBuffer = mldsaBuffer;
            } else if (mldsaBuffer.length === combinedSize) {
                mldsaPrivateKeyBuffer = mldsaBuffer.subarray(0, privateKeySize);
            } else {
                throw new Error(
                    `Invalid ML-DSA key length for security level ${securityLevel}. Expected ${privateKeySize} bytes (private only) or ${combinedSize} bytes (private+public), got ${mldsaBuffer.length} bytes.`,
                );
            }

            if (chainCode && chainCode.length !== 32) {
                throw new Error('Chain code must be 32 bytes');
            }

            this._chainCode = chainCode || new Uint8Array(32);

            this._mldsaKeypair = QuantumBIP32Factory.fromPrivateKey(
                mldsaPrivateKeyBuffer,
                this._chainCode,
                this.network,
                securityLevel,
            );
        } else {
            this._mldsaKeypair = QuantumBIP32Factory.fromBase58(parsedMLDSAKey);
            this._chainCode = new Uint8Array(this._mldsaKeypair.chainCode);
            this._securityLevel = this._mldsaKeypair.securityLevel;
        }

        this._bufferPubKey = this._keypair.publicKey;
        this._address = new Address(this._mldsaKeypair.publicKey, this._keypair.publicKey);

        this._p2tr = this._address.p2tr(this.network);
        this._p2wpkh = this._address.p2wpkh(this.network);
        this._legacy = this._address.p2pkh(this.network);
        this._segwitLegacy = this._address.p2shp2wpkh(this.network);
        this._p2wda = this._address.p2wda(this.network);

        this._tweakedKey = this._address.tweakedPublicKeyToBuffer();
    }

    public get address(): Address {
        return this._address;
    }

    public get tweakedPubKeyKey(): Uint8Array {
        return this._tweakedKey;
    }

    public get keypair(): UniversalSigner {
        if (!this._keypair) throw new Error('Keypair not set');
        return this._keypair;
    }

    public get mldsaKeypair(): QuantumBIP32Interface {
        return this._mldsaKeypair;
    }

    public get securityLevel(): MLDSASecurityLevel {
        return this._securityLevel;
    }

    public get chainCode(): Uint8Array {
        return this._chainCode;
    }

    public get p2wpkh(): string {
        return this._p2wpkh;
    }

    public get p2tr(): string {
        return this._p2tr;
    }

    public get p2wda(): IP2WSHAddress {
        return this._p2wda;
    }

    public get legacy(): string {
        return this._legacy;
    }

    public get addresses(): string[] {
        return [this.p2wpkh, this.p2tr, this.legacy, this.segwitLegacy];
    }

    public get segwitLegacy(): string {
        return this._segwitLegacy;
    }

    public get publicKey(): Uint8Array {
        if (!this._bufferPubKey) throw new Error('Public key not set');
        return this._bufferPubKey;
    }

    public get quantumPublicKey(): Uint8Array {
        return new Uint8Array(this._mldsaKeypair.publicKey);
    }

    public get quantumPrivateKey(): Uint8Array {
        if (!this._mldsaKeypair.privateKey) {
            throw new Error('Quantum private key not set');
        }

        return new Uint8Array(this._mldsaKeypair.privateKey);
    }

    public get quantumPublicKeyHex(): string {
        return toHex(new Uint8Array(this._mldsaKeypair.publicKey));
    }

    public get quantumPrivateKeyHex(): string {
        if (!this._mldsaKeypair.privateKey) {
            throw new Error('Quantum private key not set');
        }

        return toHex(new Uint8Array(this._mldsaKeypair.privateKey));
    }

    public get xOnly(): Uint8Array {
        if (!this.keypair) throw new Error('Keypair not set');
        return toXOnly(this._bufferPubKey as PublicKey);
    }

    public static fromWif(
        wif: string,
        quantumPrivateKeyHex: string,
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
        chainCode?: Uint8Array,
    ): Wallet {
        return new Wallet(wif, quantumPrivateKeyHex, network, securityLevel, chainCode);
    }

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

    public static fromPrivateKeys(
        privateKeyHexOrWif: string,
        mldsaPrivateKeyOrBase58: string,
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
        chainCode?: Uint8Array,
    ): Wallet {
        return new Wallet(
            privateKeyHexOrWif,
            mldsaPrivateKeyOrBase58,
            network,
            securityLevel,
            chainCode,
        );
    }

    public toWIF(): string {
        return this._keypair.toWIF();
    }

    public toPrivateKeyHex(): string {
        if (!this._keypair.privateKey) {
            throw new Error('Private key not available');
        }

        return toHex(this._keypair.privateKey);
    }

    public toPublicKeyHex(): string {
        return toHex(this._bufferPubKey);
    }

    public toQuantumBase58(): string {
        return this._mldsaKeypair.toBase58();
    }

    /**
     * Best-effort zeroing of private key material held by this wallet.
     *
     * Zeros classical and quantum private key buffers and the chain code in-place.
     * This cannot guarantee all copies are erased (the JS runtime may have copied
     * buffers internally, and string representations cannot be zeroed), but it
     * eliminates the primary references.
     */
    public zeroize(): void {
        this._keypair.privateKey?.fill(0);
        this._mldsaKeypair.privateKey?.fill(0);
        this._chainCode.fill(0);
    }

    public [Symbol.dispose](): void {
        this.zeroize();
    }

    public derivePath(path: string): Wallet {
        const derivedQuantum = this._mldsaKeypair.derivePath(path);

        if (!this._keypair.privateKey) {
            throw new Error('Cannot derive from a watch-only wallet (no private key available)');
        }

        const bip32Root = EcKeyPair.BIP32.fromPrivateKey(
            this._keypair.privateKey,
            this._chainCode,
            this.network,
        );

        const derivedClassical = bip32Root.derivePath(path);
        if (!derivedClassical.privateKey) {
            throw new Error('Failed to derive classical private key');
        }

        if (!derivedClassical.chainCode) {
            throw new Error('Failed to derive classical chain code');
        }

        return new Wallet(
            toHex(new Uint8Array(derivedClassical.privateKey)),
            derivedQuantum.toBase58(),
            this.network,
            this._securityLevel,
            new Uint8Array(derivedClassical.chainCode),
        );
    }
}
