/// <reference types="node" />
export declare class MultiSignGenerator {
    static readonly MAXIMUM_SUPPORTED_SIGNATURE = 255;
    static compile(vaultPublicKeys: Buffer[], minimumSignatures?: number, internal?: Buffer): Buffer;
}
