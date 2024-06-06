/// <reference types="node" />
export declare class Compressor {
    private static readonly zlibOptions;
    static compress(data: Uint8Array | Buffer): Buffer;
    static decompress(data: Uint8Array | Buffer): Buffer;
}
