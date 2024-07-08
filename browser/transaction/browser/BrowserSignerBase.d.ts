/// <reference types="node" />
import { Network, Psbt, Signer } from 'bitcoinjs-lib';
import { Address } from '@btc-vision/bsi-binary';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
export declare abstract class CustomKeypair implements Signer {
    abstract network: Network;
    abstract publicKey: Buffer;
    abstract addresses: Address[];
    abstract p2tr: Address;
    abstract p2pkh: Address;
    protected constructor();
    abstract signTransaction(transaction: Psbt, input: PsbtInput, i: number, sighashTypes: number[]): Promise<Psbt>;
    abstract getPublicKey(): Buffer;
    abstract sign(hash: Buffer, lowR?: boolean): Buffer;
    abstract signSchnorr(hash: Buffer): Buffer;
    abstract verify(hash: Buffer, signature: Buffer): boolean;
    abstract init(): Promise<void>;
}
