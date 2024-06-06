/// <reference types="node" />
import { Network, Signer } from 'bitcoinjs-lib';
export interface TweakSettings {
    readonly network?: Network;
    tweakHash?: Buffer;
}
export declare class TweakedSigner {
    static tweakSigner(signer: Signer, opts?: TweakSettings): Signer;
}
