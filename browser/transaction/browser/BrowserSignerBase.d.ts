/// <reference types="node" />
import { Network, Psbt, Signer } from 'bitcoinjs-lib';
import { Address } from '@btc-vision/bsi-binary';
export declare abstract class CustomKeypair implements Signer {
    abstract network: Network;
    abstract publicKey: Buffer;
    abstract addresses: Address[];
    abstract p2tr: Address;
    abstract p2wpkh: Address;
    protected constructor();
    abstract signTaprootInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void>;
    abstract signInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void>;
    abstract getPublicKey(): Buffer;
    abstract sign(hash: Buffer, lowR?: boolean): Buffer;
    abstract signSchnorr(hash: Buffer): Buffer;
    abstract verify(hash: Buffer, signature: Buffer): boolean;
    abstract init(): Promise<void>;
}
