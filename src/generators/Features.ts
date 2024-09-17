import { opcodes } from 'bitcoinjs-lib';

export enum Features {
    UNWRAP = 0, // random number just to set the first value
}

export const FeatureOpCodes: { [key: number]: number } = {
    [Features.UNWRAP]: opcodes.OP_16,
};
