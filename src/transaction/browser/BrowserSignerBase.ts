import { Network, Psbt, Signer } from 'bitcoinjs-lib';
import { Address } from '@btc-vision/bsi-binary';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';

/**
 * Create a custom keypair.
 * @class CustomKeypair
 */
export abstract class CustomKeypair implements Signer {
    public abstract network: Network;

    public abstract publicKey: Buffer;

    public abstract addresses: Address[];

    public abstract p2tr: Address;
    public abstract p2pkh: Address;

    protected constructor() {}

    public abstract signTransaction(
        transaction: Psbt,
        input: PsbtInput,
        i: number,
        sighashTypes: number[],
    ): Promise<Psbt>;

    public abstract getPublicKey(): Buffer;

    public abstract sign(hash: Buffer, lowR?: boolean): Buffer;

    public abstract signSchnorr(hash: Buffer): Buffer;

    public abstract verify(hash: Buffer, signature: Buffer): boolean;

    public abstract init(): Promise<void>;
}
