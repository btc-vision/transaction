import { Address } from '../../keypair/Address.js';

export interface IChallengeVerification {
    readonly epochHash: Uint8Array;
    readonly epochRoot: Uint8Array;
    readonly targetHash: Uint8Array;
    readonly targetChecksum: Uint8Array;
    readonly startBlock: bigint;
    readonly endBlock: bigint;
    readonly proofs: readonly Uint8Array[];
}

export interface IChallengeSolution {
    readonly epochNumber: bigint;
    readonly publicKey: Address;
    readonly solution: Uint8Array;
    readonly salt: Uint8Array;
    readonly graffiti: Uint8Array;
    readonly difficulty: number;
    readonly verification: IChallengeVerification;

    verifySubmissionSignature(): boolean;
    getSubmission(): IChallengeSubmission | undefined;
    toRaw(): RawChallenge;
    verify(): boolean;
    toBuffer(): Uint8Array;
    toHex(): string;
    calculateSolution(): Uint8Array;
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
    readonly solution: Uint8Array;
    readonly graffiti: Uint8Array | undefined;
    readonly signature: Uint8Array;
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
