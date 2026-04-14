import {
    type MessageHash,
    type PublicKey,
    type SchnorrSignature,
    type Signature,
    type UniversalSigner,
} from '@btc-vision/ecpair';
import { backend } from '../ecc/backend.js';
import { crypto, fromHex, type Network, toHex, toXOnly } from '@btc-vision/bitcoin';
import { TweakedSigner } from '../signer/TweakedSigner.js';
import { EcKeyPair } from './EcKeyPair.js';
import { MLDSASecurityLevel, type QuantumBIP32Interface } from '@btc-vision/bip32';
import { isOPWallet, type OPWallet } from '../transaction/browser/types/OPWallet.js';
import type { Web3Provider } from '../transaction/browser/Web3Provider.js';
import type { MLDSASignature } from '../transaction/interfaces/IWeb3ProviderTypes.js';
import { SignatureType } from '../transaction/browser/types/Unisat.js';

export interface SignedMessage {
    readonly signature: Uint8Array;
    readonly message: Uint8Array;
}

export interface MLDSASignedMessage {
    readonly signature: Uint8Array;
    readonly message: Uint8Array;
    readonly publicKey: Uint8Array;
    readonly securityLevel: MLDSASecurityLevel;
}

interface WindowWithOPWallet {
    opnet?: OPWallet;
}

class MessageSignerBase {
    public sha256(message: Uint8Array): Uint8Array {
        return crypto.sha256(message);
    }

    public async trySignSchnorrWithOPWallet(
        message: Uint8Array | string,
        walletProvider?: Web3Provider,
    ): Promise<SignedMessage | null> {
        const messageBuffer =
            typeof message === 'string' ? new TextEncoder().encode(message) : message;
        const hashedMessage = this.sha256(messageBuffer);
        const messageHex = toHex(hashedMessage);

        // If the caller passed an explicit Web3Provider, use its signSchnorr
        // (the Web3Provider interface supports Schnorr signing directly).
        if (walletProvider) {
            const signatureHex = await walletProvider.signSchnorr(messageHex);
            return {
                signature: fromHex(signatureHex),
                message: hashedMessage,
            };
        }

        // Fallback to auto-detected window.opnet OPWallet via signData
        // (preserves backward compatibility with existing callers).
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const signatureHex = await wallet.signData(
            messageHex,
            SignatureType.schnorr,
            typeof message === 'string' ? message : undefined,
        );

        return {
            signature: fromHex(signatureHex),
            message: hashedMessage,
        };
    }

    public async trySignECDSAWithOPWallet(
        message: Uint8Array | string,
    ): Promise<SignedMessage | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const messageBuffer =
            typeof message === 'string' ? new TextEncoder().encode(message) : message;

        const hashedMessage = this.sha256(messageBuffer);
        const messageHex = toHex(hashedMessage);

        const signatureHex = await wallet.signData(
            messageHex,
            SignatureType.ecdsa,
            typeof message === 'string' ? message : undefined,
        );

        return {
            signature: fromHex(signatureHex),
            message: hashedMessage,
        };
    }

    public async trySignMLDSAWithOPWallet(
        message: Uint8Array | string,
        walletProvider?: Web3Provider,
    ): Promise<MLDSASignedMessage | null> {
        const web3 = walletProvider ?? this.getOPWallet()?.web3;
        if (!web3) {
            return null;
        }

        const messageBuffer =
            typeof message === 'string' ? new TextEncoder().encode(message) : message;

        const hashedMessage = this.sha256(messageBuffer);
        const messageHex = toHex(hashedMessage);

        const result: MLDSASignature = await web3.signMLDSAMessage(
            messageHex,
            typeof message === 'string' ? message : undefined,
        );

        return {
            signature: fromHex(result.signature),
            message: hashedMessage,
            publicKey: fromHex(result.publicKey),
            securityLevel: result.securityLevel,
        };
    }

    public async signMessageAuto(
        message: Uint8Array | string,
        keypair?: UniversalSigner,
        walletProvider?: Web3Provider,
    ): Promise<SignedMessage> {
        if (!keypair) {
            const walletResult = await this.trySignSchnorrWithOPWallet(message, walletProvider);
            if (walletResult) {
                return walletResult;
            }

            throw new Error(
                'No keypair provided and no browser wallet is available for signing.',
            );
        }

        return this.signMessage(keypair, message);
    }

    public async signMessageECDSAAuto(
        message: Uint8Array | string,
        keypair?: UniversalSigner,
    ): Promise<SignedMessage> {
        if (!keypair) {
            const walletResult = await this.trySignECDSAWithOPWallet(message);
            if (walletResult) {
                return walletResult;
            }

            throw new Error('No keypair provided and OP_WALLET is not available.');
        }

        return this.signECDSA(keypair, message);
    }

    public async tweakAndSignMessageAuto(
        message: Uint8Array | string,
        keypair?: UniversalSigner,
        network?: Network,
        walletProvider?: Web3Provider,
    ): Promise<SignedMessage> {
        if (!keypair) {
            const walletResult = await this.trySignSchnorrWithOPWallet(message, walletProvider);
            if (walletResult) {
                return walletResult;
            }

            throw new Error(
                'No keypair provided and no browser wallet is available for signing.',
            );
        }

        if (!network) {
            throw new Error('Network is required when signing with a local keypair.');
        }

        return this.tweakAndSignMessage(keypair, message, network);
    }

    public async signMLDSAMessageAuto(
        message: Uint8Array | string,
        mldsaKeypair?: QuantumBIP32Interface,
        walletProvider?: Web3Provider,
    ): Promise<MLDSASignedMessage> {
        if (!mldsaKeypair) {
            const walletResult = await this.trySignMLDSAWithOPWallet(message, walletProvider);
            if (walletResult) {
                return walletResult;
            }

            throw new Error(
                'No ML-DSA keypair provided and no browser wallet is available for signing.',
            );
        }

        return this.signMLDSAMessage(mldsaKeypair, message);
    }

    public async verifyMLDSAWithOPWallet(
        message: Uint8Array | string,
        signature: MLDSASignedMessage,
        walletProvider?: Web3Provider,
    ): Promise<boolean | null> {
        const web3 = walletProvider ?? this.getOPWallet()?.web3;
        if (!web3) {
            return null;
        }

        const messageBuffer =
            typeof message === 'string' ? new TextEncoder().encode(message) : message;

        const hashedMessage = this.sha256(messageBuffer);

        const mldsaSignature: MLDSASignature = {
            signature: toHex(signature.signature),
            publicKey: toHex(signature.publicKey),
            securityLevel: signature.securityLevel,
            messageHash: toHex(hashedMessage),
        };

        return web3.verifyMLDSASignature(toHex(hashedMessage), mldsaSignature);
    }

    public async getMLDSAPublicKeyFromOPWallet(
        walletProvider?: Web3Provider,
    ): Promise<Uint8Array | null> {
        const web3 = walletProvider ?? this.getOPWallet()?.web3;
        if (!web3) {
            return null;
        }

        const publicKeyHex = await web3.getMLDSAPublicKey();
        return fromHex(publicKeyHex);
    }

    public tweakAndSignMessage(
        keypair: UniversalSigner,
        message: Uint8Array | string,
        network: Network,
    ): SignedMessage {
        const tweaked = TweakedSigner.tweakSigner(keypair, { network });
        return this.signMessage(tweaked, message);
    }

    public signMessage(keypair: UniversalSigner, message: Uint8Array | string): SignedMessage {
        if (typeof message === 'string') {
            message = new TextEncoder().encode(message);
        }

        if (!keypair.privateKey) {
            throw new Error('Private key not found in keypair.');
        }

        const hashedMessage = this.sha256(message);

        if (!backend.signSchnorr) {
            throw new Error('backend.signSchnorr is not available.');
        }

        return {
            signature: backend.signSchnorr(hashedMessage as MessageHash, keypair.privateKey),
            message: hashedMessage,
        };
    }

    public signECDSA(keypair: UniversalSigner, message: Uint8Array | string): SignedMessage {
        if (typeof message === 'string') {
            message = new TextEncoder().encode(message);
        }

        if (!keypair.privateKey) {
            throw new Error('Private key not found in keypair.');
        }

        const hashedMessage = this.sha256(message);

        if (!backend.sign) {
            throw new Error('backend.signSchnorr is not available.');
        }

        return {
            signature: backend.sign(hashedMessage as MessageHash, keypair.privateKey),
            message: hashedMessage,
        };
    }

    public verifyECDSASignature(
        publicKey: Uint8Array | PublicKey,
        message: Uint8Array | string,
        signature: Uint8Array | Signature,
    ): boolean {
        if (typeof message === 'string') {
            message = new TextEncoder().encode(message);
        }

        if (signature.length !== 64) {
            throw new Error('Invalid signature length.');
        }

        const hashedMessage = this.sha256(message);
        if (!backend.verify) {
            throw new Error('backend.verifySchnorr is not available.');
        }

        return backend.verify(
            hashedMessage as MessageHash,
            publicKey as PublicKey,
            signature as Signature,
        );
    }

    public verifySignature(
        publicKey: Uint8Array,
        message: Uint8Array | string,
        signature: Uint8Array,
    ): boolean {
        if (typeof message === 'string') {
            message = new TextEncoder().encode(message);
        }

        if (signature.length !== 64) {
            throw new Error('Invalid signature length.');
        }

        const hashedMessage = this.sha256(message);
        if (!backend.verifySchnorr) {
            throw new Error('backend.verifySchnorr is not available.');
        }

        return backend.verifySchnorr(
            hashedMessage as MessageHash,
            toXOnly(publicKey as PublicKey),
            signature as SchnorrSignature,
        );
    }

    public tweakAndVerifySignature(
        publicKey: Uint8Array,
        message: Uint8Array | string,
        signature: Uint8Array,
    ): boolean {
        const tweakedPublicKey = EcKeyPair.tweakPublicKey(publicKey);
        return this.verifySignature(tweakedPublicKey, message, signature);
    }

    public signMLDSAMessage(
        mldsaKeypair: QuantumBIP32Interface,
        message: Uint8Array | string,
    ): MLDSASignedMessage {
        if (typeof message === 'string') {
            message = new TextEncoder().encode(message);
        }

        if (!mldsaKeypair.privateKey) {
            throw new Error('ML-DSA private key not found in keypair.');
        }

        const hashedMessage = this.sha256(message);
        const signature = mldsaKeypair.sign(hashedMessage);

        return {
            signature: new Uint8Array(signature),
            message: hashedMessage,
            publicKey: new Uint8Array(mldsaKeypair.publicKey),
            securityLevel: mldsaKeypair.securityLevel,
        };
    }

    public verifyMLDSASignature(
        mldsaKeypair: QuantumBIP32Interface,
        message: Uint8Array | string,
        signature: Uint8Array,
    ): boolean {
        if (typeof message === 'string') {
            message = new TextEncoder().encode(message);
        }

        const hashedMessage = this.sha256(message);
        return mldsaKeypair.verify(hashedMessage, signature);
    }

    public isOPWalletAvailable(): boolean {
        return this.getOPWallet() !== null;
    }

    private getOPWallet(): OPWallet | null {
        if (typeof window === 'undefined') {
            return null;
        }

        const _window = window as WindowWithOPWallet;
        if (!_window.opnet || !isOPWallet(_window.opnet)) {
            return null;
        }

        return _window.opnet;
    }
}

export const MessageSigner = new MessageSignerBase();
