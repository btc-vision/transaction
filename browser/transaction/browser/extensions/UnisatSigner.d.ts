/// <reference types="node" />
import { CustomKeypair } from '../BrowserSignerBase.js';
import { Network, Psbt } from 'bitcoinjs-lib';
import { Unisat } from '../types/Unisat.js';
import { Address } from '@btc-vision/bsi-binary';
declare global {
    interface Window {
        unisat?: Unisat;
    }
}
export declare class UnisatSigner extends CustomKeypair {
    private isInitialized;
    constructor();
    private _p2tr;
    get p2tr(): Address;
    private _p2wpkh;
    get p2wpkh(): Address;
    private _addresses;
    get addresses(): Address[];
    private _publicKey;
    get publicKey(): Buffer;
    _network: Network | undefined;
    get network(): Network;
    get unisat(): Unisat;
    init(): Promise<void>;
    getPublicKey(): Buffer;
    sign(hash: Buffer, lowR?: boolean): Buffer;
    signSchnorr(hash: Buffer): Buffer;
    verify(hash: Buffer, signature: Buffer): boolean;
    signTaprootInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void>;
    signInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void>;
    private combine;
    private signTweaked;
    private getNonDuplicateScriptSig;
}
