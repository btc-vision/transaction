import { Address } from '../../keypair/Address.js';

export interface IChallengeVerification {
    readonly epochHash: Buffer;
    readonly epochRoot: Buffer;
    readonly targetHash: Buffer;
    readonly targetChecksum: Buffer;
    readonly startBlock: bigint;
    readonly endBlock: bigint;
    readonly proofs: readonly Buffer[];
}

export interface IChallengeSolution {
    readonly epochNumber: bigint;
    readonly publicKey: Address;
    readonly solution: Buffer;
    readonly salt: Buffer;
    readonly graffiti: Buffer;
    readonly difficulty: number;
    readonly verification: IChallengeVerification;
}

export interface RawChallengeVerification {
    readonly epochHash: string;
    readonly epochRoot: string;
    readonly targetHash: string;
    readonly targetChecksum: string;
    readonly startBlock: string;
    readonly endBlock: string;
    readonly proofs: readonly string[];
}

export interface RawChallengeSubmission {
    readonly classicPublicKey: string;
    readonly publicKey: string;
    readonly solution: string;
    readonly graffiti?: string;
    readonly signature: string;
}

export interface IChallengeSubmission {
    readonly publicKey: Address;
    readonly solution: Buffer;
    readonly graffiti?: Buffer;
    readonly signature: Buffer;
}

export interface RawChallenge {
    readonly epochNumber: string;
    readonly classicPublicKey: string;
    readonly publicKey: string;
    readonly solution: string;
    readonly salt: string;
    readonly graffiti: string;
    readonly difficulty: number;
    readonly verification: RawChallengeVerification;
    readonly submission?: RawChallengeSubmission;
}
