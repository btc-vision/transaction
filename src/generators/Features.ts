import type { LoadedStorage } from '../transaction/interfaces/ITransactionParameters.js';
import type { ChallengeSubmission } from '../epoch/ChallengeSolution.js';
import type { MLDSARequestData } from './MLDSAData.js';

export enum Features {
    ACCESS_LIST = 0b1,
    EPOCH_SUBMISSION = 0b10,
    MLDSA_LINK_PUBKEY = 0b100,
}

export enum FeaturePriority {
    ACCESS_LIST = 1,
    EPOCH_SUBMISSION = 2,
    MLDSA_LINK_PUBKEY = 3,
}

export interface Feature<T extends Features> {
    opcode: T;
    data: unknown;
    priority: number;
}

export interface AccessListFeature extends Feature<Features.ACCESS_LIST> {
    data: LoadedStorage;
}

export interface EpochSubmissionFeature extends Feature<Features.EPOCH_SUBMISSION> {
    data: ChallengeSubmission;
}

export interface MLDSALinkRequest extends Feature<Features.MLDSA_LINK_PUBKEY> {
    data: MLDSARequestData;
}
