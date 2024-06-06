/// <reference types="node" />
import { Network } from 'bitcoinjs-lib';
import { Generator } from '../Generator.js';
export declare class CalldataGenerator extends Generator {
    constructor(senderPubKey: Buffer, contractSaltPubKey: Buffer, network?: Network);
    compile(calldata: Buffer, contractSecret: Buffer, vaultPublicKeys?: Buffer[], minimumSignatures?: number): Buffer;
    private getPubKeyAsBuffer;
}
