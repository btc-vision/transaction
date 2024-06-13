/// <reference types="node" />
import { Network } from 'bitcoinjs-lib';
export declare class MultiSignGenerator {
    private readonly internal;
    private readonly vaultPublicKeys;
    private readonly minimumSignatures;
    private readonly network;
    constructor(internal: Buffer, vaultPublicKeys?: Buffer[], minimumSignatures?: number, network?: Network);
    compile(): Buffer;
}
