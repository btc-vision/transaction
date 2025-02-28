import { Network, Psbt, Signer } from '@btc-vision/bitcoin';

/**
 * Create a custom keypair.
 * @class CustomKeypair
 */
export abstract class CustomKeypair implements Signer {
    public abstract network: Network;

    public abstract publicKey: Buffer;

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

    public abstract getPublicKey(): Buffer;

    public abstract sign(hash: Buffer, lowR?: boolean): Buffer;

    public abstract signSchnorr(hash: Buffer): Buffer;

    public abstract verify(hash: Buffer, signature: Buffer): Buffer;

    public abstract init(): Promise<void>;
}
