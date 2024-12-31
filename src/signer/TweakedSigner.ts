import * as ecc from '@bitcoinerlab/secp256k1';
import { initEccLib, Network, Signer, tapTweakHash, toXOnly } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { EcKeyPair } from '../keypair/EcKeyPair.js';

initEccLib(ecc);

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
    tweakHash?: Buffer;
}

/**
 * Class for tweaking signers
 * @class TweakedSigner
 */
export class TweakedSigner {
    /**
     * Tweak a signer
     * @param {Signer} signer - The signer to tweak
     * @param {TweakSettings} opts - The tweak settings
     * @returns {ECPairInterface} - The tweaked signer
     */
    public static tweakSigner(signer: ECPairInterface, opts: TweakSettings = {}): ECPairInterface {
        let privateKey: Uint8Array | undefined = signer.privateKey;
        if (!privateKey) {
            throw new Error('Private key is required for tweaking signer!');
        }

        if (signer.publicKey[0] === 3) {
            privateKey = ecc.privateNegate(privateKey);
        }

        const tweakedPrivateKey = ecc.privateAdd(
            privateKey,
            tapTweakHash(toXOnly(Buffer.from(signer.publicKey)), opts.tweakHash),
        );

        if (!tweakedPrivateKey) {
            throw new Error('Invalid tweaked private key!');
        }

        return EcKeyPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), opts.network);
    }
}
