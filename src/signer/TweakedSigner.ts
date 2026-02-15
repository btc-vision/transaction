import { backend } from '../ecc/backend.js';
import { type Bytes32, type Network, type PrivateKey, type Signer, tapTweakHash, toXOnly, } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import { EcKeyPair } from '../keypair/EcKeyPair.js';

/**
 * Tweak settings
 */
export interface TweakSettings {
    /**
     * The network to use
     */
    readonly network?: Network;

    /**
     * The tweak hash to use
     */
    tweakHash?: Bytes32;
}

/**
 * Type guard to check if a Signer is a UniversalSigner (has privateKey).
 */
export function isUniversalSigner(signer: Signer): signer is UniversalSigner {
    return 'privateKey' in signer && signer.privateKey != null;
}

/**
 * Class for tweaking signers
 * @class TweakedSigner
 */
export class TweakedSigner {
    /**
     * Tweak a signer
     * @param {UniversalSigner} signer - The signer to tweak (must have privateKey)
     * @param {TweakSettings} opts - The tweak settings
     * @returns {UniversalSigner} - The tweaked signer
     */
    public static tweakSigner(signer: UniversalSigner, opts: TweakSettings = {}): UniversalSigner {
        let privateKey: PrivateKey | undefined = signer.privateKey;
        if (!privateKey) {
            throw new Error('Private key is required for tweaking signer!');
        }

        if (signer.publicKey[0] === 3) {
            privateKey = backend.privateNegate(privateKey);
        }

        const tweakedPrivateKey = backend.privateAdd(
            privateKey,
            tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash),
        );

        if (!tweakedPrivateKey) {
            throw new Error('Invalid tweaked private key!');
        }

        return EcKeyPair.fromPrivateKey(tweakedPrivateKey, opts.network);
    }
}
