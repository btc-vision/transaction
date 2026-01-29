import type { ITransactionParameters } from './ITransactionParameters.js';

export interface ICancelTransactionParameters extends Omit<
    ITransactionParameters,
    'priorityFee' | 'gasSatFee'
> {
    readonly compiledTargetScript: string | Uint8Array;
}
