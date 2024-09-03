/// <reference types="node" />
import { VaultUTXOs } from '../transaction/processor/PsbtTransaction.js';
export declare class BitcoinUtils {
    static btcToSatoshi(btc: number): BigInt;
    static rndBytes(): Buffer;
    static getUnsafeRandomValues(length: number): Buffer;
    static opnetHash(data: Buffer): string;
    static orderVaultsByAddress(vaults: VaultUTXOs[]): VaultUTXOs[];
    static findVaultWithMostPublicKeys(vaults: VaultUTXOs[]): VaultUTXOs;
}
