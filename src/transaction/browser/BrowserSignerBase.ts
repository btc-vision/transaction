import { Network, Psbt, Signer } from '@btc-vision/bitcoin';

/**
 * Create a custom keypair.
 * @class CustomKeypair
 */
export abstract class CustomKeypair implements Signer {
    public abstract network: Network;

    public abstract publicKey: Uint8Array;

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

    public abstract getPublicKey(): Uint8Array;

    public abstract sign(hash: Uint8Array, lowR?: boolean): Uint8Array;

    public abstract signSchnorr(hash: Uint8Array): Uint8Array;

    public abstract verify(hash: Uint8Array, signature: Uint8Array): boolean | Uint8Array;

    public abstract init(): Promise<void>;
}
