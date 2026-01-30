import { type Network, Psbt, type Signer } from '@btc-vision/bitcoin';
import {
    type MessageHash,
    type PublicKey,
    type SchnorrSignature,
    type Signature,
} from '@btc-vision/ecpair';

/**
 * Create a custom keypair.
 * @class CustomKeypair
 */
export abstract class CustomKeypair implements Signer {
    public abstract network: Network;

    public abstract publicKey: PublicKey;

    public abstract addresses: string[];

    public abstract p2tr: string;
    public abstract p2wpkh: string;

    protected constructor() {}

    public abstract signTaprootInput(
        transaction: Psbt,
        i: number,
        sighashTypes: number[],
    ): Promise<void>;

    public abstract signInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void>;

    public abstract getPublicKey(): PublicKey;

    public abstract sign(hash: MessageHash, lowR?: boolean): Signature;

    public abstract signSchnorr(hash: MessageHash): SchnorrSignature;

    public abstract verify(hash: MessageHash, signature: Signature): boolean;

    public abstract init(): Promise<void>;
}
