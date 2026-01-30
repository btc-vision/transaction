import type { PsbtParallelKeyPair } from '@btc-vision/bitcoin';
import type { UniversalSigner } from '@btc-vision/ecpair';
import { createPrivateKey, createPublicKey } from '@btc-vision/ecpair';

/**
 * Wraps an untweaked UniversalSigner as PsbtParallelKeyPair.
 * Used for script-path signing (raw private key needed).
 */
export function toParallelKeyPair(signer: UniversalSigner): PsbtParallelKeyPair {
    return {
        publicKey: signer.publicKey,
        getPrivateKey(): Uint8Array {
            if (!signer.privateKey) {
                throw new Error('Signer does not have a private key');
            }
            return createPrivateKey(signer.privateKey);
        },
        sign(hash: Uint8Array, lowR?: boolean): Uint8Array {
            return signer.sign(hash as Parameters<typeof signer.sign>[0], lowR);
        },
        signSchnorr(hash: Uint8Array): Uint8Array {
            if (!signer.signSchnorr) {
                throw new Error('Signer does not support Schnorr signing');
            }
            return signer.signSchnorr(hash as Parameters<typeof signer.signSchnorr>[0]);
        },
    };
}

/**
 * Creates a hybrid adapter with untweaked publicKey (for PSBT input matching)
 * but tweaked privateKey (for correct key-path Schnorr signatures).
 * Uses createPrivateKey/createPublicKey for branded type validation.
 */
export function toTweakedParallelKeyPair(
    untweakedSigner: UniversalSigner,
    tweakedSigner: UniversalSigner,
): PsbtParallelKeyPair {
    return {
        publicKey: createPublicKey(untweakedSigner.publicKey),
        getPrivateKey(): Uint8Array {
            if (!tweakedSigner.privateKey) {
                throw new Error('Tweaked signer does not have a private key');
            }
            return createPrivateKey(tweakedSigner.privateKey);
        },
        sign(hash: Uint8Array, lowR?: boolean): Uint8Array {
            return tweakedSigner.sign(hash as Parameters<typeof tweakedSigner.sign>[0], lowR);
        },
        signSchnorr(hash: Uint8Array): Uint8Array {
            if (!tweakedSigner.signSchnorr) {
                throw new Error('Tweaked signer does not support Schnorr signing');
            }
            return tweakedSigner.signSchnorr(
                hash as Parameters<typeof tweakedSigner.signSchnorr>[0],
            );
        },
    };
}
