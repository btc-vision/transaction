import {
    type MessageHash,
    type PublicKey,
    type SchnorrSignature,
    type UniversalSigner,
} from '@btc-vision/ecpair';
import { backend } from '../ecc/backend.js';
import { crypto, fromHex, Network, toHex, toXOnly } from '@btc-vision/bitcoin';
import { TweakedSigner } from '../signer/TweakedSigner.js';
import { EcKeyPair } from './EcKeyPair.js';
import { MLDSASecurityLevel, QuantumBIP32Interface } from '@btc-vision/bip32';
import { isOPWallet, OPWallet } from '../transaction/browser/types/OPWallet.js';
import { MLDSASignature } from '../transaction/interfaces/IWeb3ProviderTypes.js';

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
    ): Promise<SignedMessage | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const messageBuffer =
            typeof message === 'string' ? new TextEncoder().encode(message) : message;

        const hashedMessage = this.sha256(messageBuffer);
        const messageHex = toHex(hashedMessage);

        const signatureHex = await wallet.web3.signSchnorr(messageHex);
        return {
            signature: fromHex(signatureHex),
            message: hashedMessage,
        };
    }

    public async trySignMLDSAWithOPWallet(
        message: Uint8Array | string,
    ): Promise<MLDSASignedMessage | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const messageBuffer =
            typeof message === 'string' ? new TextEncoder().encode(message) : message;

        const hashedMessage = this.sha256(messageBuffer);
        const messageHex = toHex(hashedMessage);

        const result: MLDSASignature = await wallet.web3.signMLDSAMessage(messageHex);
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
    ): Promise<SignedMessage> {
        if (!keypair) {
            const walletResult = await this.trySignSchnorrWithOPWallet(message);
            if (walletResult) {
                return walletResult;
            }
            throw new Error('No keypair provided and OP_WALLET is not available.');
        }

        return this.signMessage(keypair, message);
    }

    public async tweakAndSignMessageAuto(
        message: Uint8Array | string,
        keypair?: UniversalSigner,
        network?: Network,
    ): Promise<SignedMessage> {
        if (!keypair) {
            const walletResult = await this.trySignSchnorrWithOPWallet(message);
            if (walletResult) {
                return walletResult;
            }
            throw new Error('No keypair provided and OP_WALLET is not available.');
        }

        if (!network) {
            throw new Error('Network is required when signing with a local keypair.');
        }

        return this.tweakAndSignMessage(keypair, message, network);
    }

    public async signMLDSAMessageAuto(
        message: Uint8Array | string,
        mldsaKeypair?: QuantumBIP32Interface,
    ): Promise<MLDSASignedMessage> {
        if (!mldsaKeypair) {
            const walletResult = await this.trySignMLDSAWithOPWallet(message);
            if (walletResult) {
                return walletResult;
            }
            throw new Error('No ML-DSA keypair provided and OP_WALLET is not available.');
        }

        return this.signMLDSAMessage(mldsaKeypair, message);
    }

    public async verifyMLDSAWithOPWallet(
        message: Uint8Array | string,
        signature: MLDSASignedMessage,
    ): Promise<boolean | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
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

        return wallet.web3.verifyMLDSASignature(toHex(hashedMessage), mldsaSignature);
    }

    public async getMLDSAPublicKeyFromOPWallet(): Promise<Uint8Array | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const publicKeyHex = await wallet.web3.getMLDSAPublicKey();
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
