/// <reference types="node" />
import { Network } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
export interface ContractAddressVerificationParams {
    readonly deployerPubKeyXOnly: Buffer;
    readonly contractSaltPubKey: Buffer;
    readonly originalSalt: Buffer;
    readonly bytecode: Buffer;
    readonly network?: Network;
}
export declare class TapscriptVerificator {
    private static readonly TAP_SCRIPT_VERSION;
    static getContractAddress(params: ContractAddressVerificationParams): string | undefined;
    static getContractSeed(deployerPubKey: Buffer, bytecode: Buffer, saltHash: Buffer): Buffer;
    static generateContractVirtualAddress(deployerPubKey: Buffer, bytecode: Buffer, saltHash: Buffer, network?: Network): string;
    static generateAddressFromScript(params: ContractAddressVerificationParams, scriptTree: Taptree): string | undefined;
}
