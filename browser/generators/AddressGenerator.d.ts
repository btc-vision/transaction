/// <reference types="node" />
import { Network } from 'bitcoinjs-lib';
export declare class AddressGenerator {
    static generatePKSH(sha256Hash: Buffer, network: Network): string;
    private static toSegwitAddress;
}
