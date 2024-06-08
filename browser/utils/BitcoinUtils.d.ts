/// <reference types="node" />
export declare class BitcoinUtils {
    static btcToSatoshi(btc: number): BigInt;
    static rndBytes(): Buffer;
    static opnetHash(data: Buffer): string;
}
