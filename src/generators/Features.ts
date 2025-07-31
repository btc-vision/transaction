import { LoadedStorage } from '../transaction/interfaces/ITransactionParameters.js';
import { ChallengeSubmission } from '../epoch/ChallengeSolution.js';

export enum Features {
    ACCESS_LIST = 1,
    EPOCH_SUBMISSION = 2,
}

export interface Feature<T extends Features> {
    opcode: T;
    data: unknown;
}

export interface AccessListFeature extends Feature<Features.ACCESS_LIST> {
    data: LoadedStorage;
}

export interface EpochSubmissionFeature extends Feature<Features.EPOCH_SUBMISSION> {
    data: ChallengeSubmission;
}
