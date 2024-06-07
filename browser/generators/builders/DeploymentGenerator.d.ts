/// <reference types="node" />
import { Network } from 'bitcoinjs-lib';
import { Generator } from '../Generator.js';
export declare class DeploymentGenerator extends Generator {
    constructor(senderPubKey: Buffer, contractSaltPubKey: Buffer, network?: Network);
    compile(contractBytecode: Buffer, contractSalt: Buffer): Buffer;
    private getAsm;
}
