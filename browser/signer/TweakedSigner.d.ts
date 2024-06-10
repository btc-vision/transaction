/// <reference types="node" />
import { Network, Signer } from 'bitcoinjs-lib';
import { ECPairInterface } from 'ecpair';
export interface TweakSettings {
    readonly network?: Network;
    tweakHash?: Buffer;
}
export declare class TweakedSigner {
    static tweakSigner(signer: ECPairInterface, opts?: TweakSettings): Signer;
}
