import { Address } from '../../keypair/Address.js';

export interface IPreimageVerification {
    readonly epochHash: Buffer;
    readonly epochRoot: Buffer;
    readonly targetHash: Buffer;
    readonly targetChecksum: Buffer;
    readonly startBlock: bigint;
    readonly endBlock: bigint;
    readonly proofs: readonly Buffer[];
}

export interface IPreimage {
    readonly epochNumber: bigint;
    readonly publicKey: Address;
    readonly solution: Buffer;
    readonly salt: Buffer;
    readonly graffiti: Buffer;
    readonly difficulty: number;
    readonly verification: IPreimageVerification;
}

export interface RawPreimageVerification {
    readonly epochHash: string;
    readonly epochRoot: string;
    readonly targetHash: string;
    readonly targetChecksum: string;
    readonly startBlock: string;
    readonly endBlock: string;
    readonly proofs: readonly string[];
}

export interface RawPreimage {
    readonly epochNumber: string;
    readonly publicKey: string;
    readonly solution: string;
    readonly salt: string;
    readonly graffiti: string;
    readonly difficulty: number;
    readonly verification: RawPreimageVerification;
}
