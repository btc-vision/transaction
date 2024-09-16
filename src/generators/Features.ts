import { opcodes } from 'bitcoinjs-lib';

export enum Features {
    UNWRAP = 16,
}

export const FeatureOpcodes = {
    [Features.UNWRAP]: opcodes.OP_16,
};
