import { Stack } from '@btc-vision/bitcoin';
import { SharedInteractionParameters } from './ITransactionParameters.js';

export interface ICustomTransactionParameters extends Omit<
    SharedInteractionParameters,
    'challenge'
> {
    script: (Buffer | Stack)[];
    witnesses: Buffer[];

    /** optional Taproot annex payload (without the 0x50 prefix) */
    annex?: Buffer;

    to: string;
}
