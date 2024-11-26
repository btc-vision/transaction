import { ECPairInterface } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import { crypto, Network } from '@btc-vision/bitcoin';
import { TweakedSigner } from '../signer/TweakedSigner.js';
import { EcKeyPair } from './EcKeyPair.js';
import { toXOnly } from '@btc-vision/bitcoin/src/psbt/bip371.js';

export interface SignedMessage {
    readonly signature: Uint8Array;
    readonly message: Uint8Array;
}

class MessageSignerBase {
    public sha256(message: Buffer | Uint8Array): Buffer {
        return crypto.sha256(Buffer.from(message));
    }

    /**
     * Tweak the keypair and sign a message.
     * @param {ECPairInterface} keypair - The keypair to sign the message with. Must contain a private key.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @param {Network} network - The network to sign the message for.
     * @returns The Schnorr signature.
     */
    public tweakAndSignMessage(
        keypair: ECPairInterface,
        message: Uint8Array | Buffer | string,
        network: Network,
    ): SignedMessage {
        const tweaked = TweakedSigner.tweakSigner(keypair, {
            network,
        });

        return this.signMessage(tweaked, message);
    }

    /**
     * Signs a message using the provided keypair.
     * @param {ECPairInterface} keypair - The keypair to sign the message with. Must contain a private key.
     * @param {Uint8Array | Buffer | string} message - The message to sign.
     * @returns The Schnorr signature.
     * @throws Error if the private key is missing or invalid.
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
     * @returns True if the signature is valid, false otherwise.
     * @throws Error if the signature length is invalid.
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
     * @returns True if the signature is valid, false otherwise.
     * @throws Error if the signature length is invalid.
     */
    public tweakAndVerifySignature(
        publicKey: Uint8Array | Buffer,
        message: Uint8Array | Buffer | string,
        signature: Uint8Array | Buffer,
    ): boolean {
        const tweakedPublicKey = EcKeyPair.tweakPublicKey(Buffer.from(publicKey));

        return this.verifySignature(tweakedPublicKey, message, signature);
    }
}

export const MessageSigner = new MessageSignerBase();
