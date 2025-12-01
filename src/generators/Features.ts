import { LoadedStorage } from '../transaction/interfaces/ITransactionParameters.js';
import { ChallengeSubmission } from '../epoch/ChallengeSolution.js';
import { MLDSARequestData } from './MLDSAData.js';

export enum Features {
    ACCESS_LIST = 0b1,
    EPOCH_SUBMISSION = 0b10,
    MLDSA_LINK_PUBKEY = 0b100,
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

export interface MLDSALinkRequest extends Feature<Features.MLDSA_LINK_PUBKEY> {
    data: MLDSARequestData;
}
