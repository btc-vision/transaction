import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ITweakedTransactionData } from '../shared/TweakedTransaction.js';
import { ChainId } from '../../network/ChainId.js';
import { PsbtOutputExtended } from '@btc-vision/bitcoin';

export interface ITransactionParameters extends ITweakedTransactionData {
    readonly from?: string;
    readonly to?: string;

    utxos: UTXO[];

    nonWitnessUtxo?: Buffer;
    estimatedFees?: bigint;

    optionalOutputs?: PsbtOutputExtended[];

    chainId?: ChainId;

    readonly feeRate: number;
    readonly priorityFee: bigint;
}

export interface IFundingTransactionParameters extends ITransactionParameters {
    amount: bigint;

    splitInputsInto?: number;
}

export interface IChallengeSolutionTransactionParameters extends ITransactionParameters {
    amount: bigint;

    readonly challengeSolution: Buffer;
}

export interface SharedInteractionParameters extends ITransactionParameters {
    calldata?: Buffer;
    disableAutoRefund?: boolean;

    readonly preimage?: Buffer;
    readonly randomBytes?: Buffer;
}

export interface IInteractionParameters extends SharedInteractionParameters {
    readonly calldata: Buffer;

    readonly to: string;
}

export interface IDeploymentParameters extends Omit<ITransactionParameters, 'to'> {
    readonly bytecode: Buffer;
    readonly calldata?: Buffer;

    readonly randomBytes?: Buffer;
    readonly preimage?: Buffer;
}
