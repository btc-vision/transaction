import { Stack } from '@btc-vision/bitcoin';
import { SharedInteractionParameters } from './ITransactionParameters.js';

export interface ICustomTransactionParameters extends Omit<
    SharedInteractionParameters,
    'challenge'
> {
    script: (Uint8Array | Stack)[];
    witnesses: Uint8Array[];

    /** optional Taproot annex payload (without the 0x50 prefix) */
    annex?: Uint8Array;

    to: string;
}
