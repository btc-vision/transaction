import { ECPairInterface } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import { crypto, Network, toXOnly } from '@btc-vision/bitcoin';
import { TweakedSigner } from '../signer/TweakedSigner.js';
import { EcKeyPair } from './EcKeyPair.js';
import { MLDSASecurityLevel, QuantumBIP32Interface } from '@btc-vision/bip32';
import { isOPWallet, OPWallet } from '../transaction/browser/types/OPWallet.js';
import { MLDSASignature } from '../transaction/browser/Web3Provider.js';

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
    public sha256(message: Buffer | Uint8Array): Buffer {
        return crypto.sha256(Buffer.from(message));
    }

    /**
     * Attempts to sign a message using OP_WALLET if available in browser environment.
     * Returns null if not in browser or OP_WALLET is not available.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @returns {Promise<SignedMessage | null>} The Schnorr signature or null if OP_WALLET unavailable.
     */
    public async trySignSchnorrWithOPWallet(
        message: Uint8Array | Buffer | string,
    ): Promise<SignedMessage | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const messageBuffer =
            typeof message === 'string' ? Buffer.from(message, 'utf-8') : Buffer.from(message);

        const hashedMessage = this.sha256(messageBuffer);
        const messageHex = hashedMessage.toString('hex');

        const signatureHex = await wallet.web3.signSchnorr(messageHex);
        return {
            signature: Buffer.from(signatureHex, 'hex'),
            message: hashedMessage,
        };
    }

    /**
     * Attempts to sign a message using OP_WALLET ML-DSA if available.
     * Returns null if not in browser or OP_WALLET is not available.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @returns {Promise<MLDSASignedMessage | null>} The ML-DSA signature or null if OP_WALLET unavailable.
     */
    public async trySignMLDSAWithOPWallet(
        message: Uint8Array | Buffer | string,
    ): Promise<MLDSASignedMessage | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const messageBuffer =
            typeof message === 'string' ? Buffer.from(message, 'utf-8') : Buffer.from(message);

        const hashedMessage = this.sha256(messageBuffer);
        const messageHex = hashedMessage.toString('hex');

        const result: MLDSASignature = await wallet.web3.signMLDSAMessage(messageHex);
        return {
            signature: Buffer.from(result.signature, 'hex'),
            message: hashedMessage,
            publicKey: Buffer.from(result.publicKey, 'hex'),
            securityLevel: result.securityLevel,
        };
    }

    /**
     * Signs a message using Schnorr, automatically using OP_WALLET if available and no keypair provided.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @param {ECPairInterface} [keypair] - Optional keypair for local signing.
     * @returns {Promise<SignedMessage>} The Schnorr signature.
     * @throws {Error} If no keypair provided and OP_WALLET is not available.
     */
    public async signMessageAuto(
        message: Uint8Array | Buffer | string,
        keypair?: ECPairInterface,
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

    /**
     * Signs a message with tweaking, automatically using OP_WALLET if available.
     * Note: OP_WALLET signSchnorr may already return a tweaked signature depending on wallet implementation.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @param {ECPairInterface} [keypair] - Optional keypair for local signing.
     * @param {Network} [network] - Network required when signing with a local keypair.
     * @returns {Promise<SignedMessage>} The Schnorr signature.
     * @throws {Error} If no keypair provided and OP_WALLET is not available.
     * @throws {Error} If keypair provided but network is missing.
     */
    public async tweakAndSignMessageAuto(
        message: Uint8Array | Buffer | string,
        keypair?: ECPairInterface,
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

    /**
     * Signs an ML-DSA message, automatically using OP_WALLET if available.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @param {QuantumBIP32Interface} [mldsaKeypair] - Optional ML-DSA keypair for local signing.
     * @returns {Promise<MLDSASignedMessage>} The ML-DSA signature with metadata.
     * @throws {Error} If no keypair provided and OP_WALLET is not available.
     */
    public async signMLDSAMessageAuto(
        message: Uint8Array | Buffer | string,
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

    /**
     * Verifies an ML-DSA signature using OP_WALLET if available.
     * Returns null if OP_WALLET is not available.
     * @param {Uint8Array | Buffer | string} message - The message to verify.
     * @param {MLDSASignedMessage} signature - The ML-DSA signature to verify.
     * @returns {Promise<boolean | null>} True if valid, false if invalid, null if OP_WALLET unavailable.
     */
    public async verifyMLDSAWithOPWallet(
        message: Uint8Array | Buffer | string,
        signature: MLDSASignedMessage,
    ): Promise<boolean | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const messageBuffer =
            typeof message === 'string' ? Buffer.from(message, 'utf-8') : Buffer.from(message);

        const hashedMessage = this.sha256(messageBuffer);

        const mldsaSignature: MLDSASignature = {
            signature: Buffer.from(signature.signature).toString('hex'),
            publicKey: Buffer.from(signature.publicKey).toString('hex'),
            securityLevel: signature.securityLevel,
            messageHash: hashedMessage.toString('hex'),
        };

        return wallet.web3.verifyMLDSASignature(hashedMessage.toString('hex'), mldsaSignature);
    }

    /**
     * Gets the ML-DSA public key from OP_WALLET if available.
     * Returns null if OP_WALLET is not available.
     * @returns {Promise<Buffer | null>} The ML-DSA public key or null if OP_WALLET unavailable.
     */
    public async getMLDSAPublicKeyFromOPWallet(): Promise<Buffer | null> {
        const wallet = this.getOPWallet();
        if (!wallet) {
            return null;
        }

        const publicKeyHex = await wallet.web3.getMLDSAPublicKey();
        return Buffer.from(publicKeyHex, 'hex');
    }

    /**
     * Tweak the keypair and sign a message.
     * @param {ECPairInterface} keypair - The keypair to sign the message with. Must contain a private key.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @param {Network} network - The network to sign the message for.
     * @returns {SignedMessage} The Schnorr signature.
     */
    public tweakAndSignMessage(
        keypair: ECPairInterface,
        message: Uint8Array | Buffer | string,
        network: Network,
    ): SignedMessage {
        const tweaked = TweakedSigner.tweakSigner(keypair, { network });
        return this.signMessage(tweaked, message);
    }

    /**
     * Signs a message using the provided keypair.
     * @param {ECPairInterface} keypair - The keypair to sign the message with. Must contain a private key.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @returns {SignedMessage} The Schnorr signature.
     * @throws {Error} If the private key is missing or invalid.
     */
    public signMessage(
        keypair: ECPairInterface,
        message: Uint8Array | Buffer | string,
    ): SignedMessage {
        if (typeof message === 'string') {
            message = Buffer.from(message, 'utf-8');
        }

        if (!keypair.privateKey) {
            throw new Error('Private key not found in keypair.');
        }

        const hashedMessage = this.sha256(message);
        return {
            signature: ecc.signSchnorr(hashedMessage, keypair.privateKey),
            message: hashedMessage,
        };
    }

    /**
     * Verifies a Schnorr signature.
     * @param {Uint8Array | Buffer} publicKey - The public key as a Uint8Array or Buffer.
     * @param {Uint8Array | Buffer | string} message - The message to verify.
     * @param {Uint8Array | Buffer} signature - The signature to verify.
     * @returns {boolean} True if the signature is valid, false otherwise.
     * @throws {Error} If the signature length is invalid.
     */
    public verifySignature(
        publicKey: Uint8Array | Buffer,
        message: Uint8Array | Buffer | string,
        signature: Uint8Array | Buffer,
    ): boolean {
        if (typeof message === 'string') {
            message = Buffer.from(message, 'utf-8');
        }

        if (signature.length !== 64) {
            throw new Error('Invalid signature length.');
        }

        const hashedMessage = this.sha256(message);
        return ecc.verifySchnorr(hashedMessage, toXOnly(Buffer.from(publicKey)), signature);
    }

    /**
     * Tweak the public key and verify a signature.
     * @param {Uint8Array | Buffer} publicKey - The public key as a Uint8Array or Buffer.
     * @param {Uint8Array | Buffer | string} message - The message to verify.
     * @param {Uint8Array | Buffer} signature - The signature to verify.
     * @returns {boolean} True if the signature is valid, false otherwise.
     * @throws {Error} If the signature length is invalid.
     */
    public tweakAndVerifySignature(
        publicKey: Uint8Array | Buffer,
        message: Uint8Array | Buffer | string,
        signature: Uint8Array | Buffer,
    ): boolean {
        const tweakedPublicKey = EcKeyPair.tweakPublicKey(Buffer.from(publicKey));
        return this.verifySignature(tweakedPublicKey, message, signature);
    }

    /**
     * Signs a message using ML-DSA signature scheme.
     * @param {QuantumBIP32Interface} mldsaKeypair - The ML-DSA keypair to sign with. Must contain a private key.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @returns {MLDSASignedMessage} The ML-DSA signature with metadata.
     * @throws {Error} If the private key is missing.
     */
    public signMLDSAMessage(
        mldsaKeypair: QuantumBIP32Interface,
        message: Uint8Array | Buffer | string,
    ): MLDSASignedMessage {
        if (typeof message === 'string') {
            message = Buffer.from(message, 'utf-8');
        }

        if (!mldsaKeypair.privateKey) {
            throw new Error('ML-DSA private key not found in keypair.');
        }

        const hashedMessage = this.sha256(message);
        const signature = mldsaKeypair.sign(hashedMessage);

        return {
            signature: Buffer.from(signature),
            message: hashedMessage,
            publicKey: Buffer.from(mldsaKeypair.publicKey),
            securityLevel: mldsaKeypair.securityLevel,
        };
    }

    /**
     * Verifies an ML-DSA signature using the provided keypair.
     * @param {QuantumBIP32Interface} mldsaKeypair - The ML-DSA keypair with the public key.
     * @param {Uint8Array | Buffer | string} message - The message to verify.
     * @param {Uint8Array | Buffer} signature - The ML-DSA signature to verify.
     * @returns {boolean} True if the signature is valid, false otherwise.
     */
    public verifyMLDSASignature(
        mldsaKeypair: QuantumBIP32Interface,
        message: Uint8Array | Buffer | string,
        signature: Uint8Array | Buffer,
    ): boolean {
        if (typeof message === 'string') {
            message = Buffer.from(message, 'utf-8');
        }

        const hashedMessage = this.sha256(message);
        return mldsaKeypair.verify(hashedMessage, signature);
    }

    /**
     * Checks if OP_WALLET is available in the current environment.
     * @returns {boolean} True if OP_WALLET is available, false otherwise.
     */
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
