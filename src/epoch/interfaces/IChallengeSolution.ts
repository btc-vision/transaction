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

    verifySubmissionSignature(): boolean;
    getSubmission(): IChallengeSubmission | undefined;
    toRaw(): RawChallenge;
    verify(): boolean;
    toBuffer(): Buffer;
    toHex(): string;
    calculateSolution(): Buffer;
    checkDifficulty(minDifficulty: number): { valid: boolean; difficulty: number };
    getMiningTargetBlock(): bigint | null;
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
    readonly mldsaPublicKey: string;
    readonly legacyPublicKey: string;
    readonly solution: string;
    readonly graffiti?: string;
    readonly signature: string;
}

export interface IChallengeSubmission {
    readonly publicKey: Address;
    readonly solution: Buffer;
    readonly graffiti: Buffer | undefined;
    readonly signature: Buffer;
    readonly epochNumber: bigint;
    verifySignature(): boolean;
}

export interface RawChallenge {
    readonly epochNumber: string;
    readonly mldsaPublicKey: string;
    readonly legacyPublicKey: string;
    readonly solution: string;
    readonly salt: string;
    readonly graffiti: string;
    readonly difficulty: number;
    readonly verification: RawChallengeVerification;
    readonly submission?: RawChallengeSubmission;
}
