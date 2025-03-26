import { LoadedStorage } from '../transaction/interfaces/ITransactionParameters.js';

export enum Features {
    ACCESS_LIST = 1,
}

export interface Feature<T extends Features> {
    opcode: T;
    data: unknown;
}

export interface AccessListFeature extends Feature<Features.ACCESS_LIST> {
    data: LoadedStorage;
}
