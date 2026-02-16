import { MLDSASecurityLevel } from '@btc-vision/bip32';

export enum MLDSAPublicKeyMetadata {
    MLDSA44 = 1312,
    MLDSA65 = 1952,
    MLDSA87 = 2592,
}

export interface MLDSARequestData {
    readonly verifyRequest: boolean;
    readonly publicKey: Uint8Array | null;
    readonly hashedPublicKey: Uint8Array;
    readonly level: MLDSASecurityLevel;

    readonly mldsaSignature: Uint8Array | null;
    readonly legacySignature: Uint8Array;
}

export function getLevelFromPublicKeyLength(length: number): MLDSASecurityLevel {
    switch (length) {
        case MLDSAPublicKeyMetadata.MLDSA44 as number:
            return MLDSASecurityLevel.LEVEL2;
        case MLDSAPublicKeyMetadata.MLDSA65 as number:
            return MLDSASecurityLevel.LEVEL3;
        case MLDSAPublicKeyMetadata.MLDSA87 as number:
            return MLDSASecurityLevel.LEVEL5;
        default:
            throw new Error(`Invalid MLDSA public key length: ${length}`);
    }
}
