import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ITweakedTransactionData } from '../shared/TweakedTransaction.js';
import { ChainId } from '../../network/ChainId.js';
import { PsbtOutputExtended } from '@btc-vision/bitcoin';
import { ChallengeSolution } from '../../epoch/ChallengeSolution.js';

export interface LoadedStorage {
    [key: string]: string[];
}

export interface ITransactionParameters extends ITweakedTransactionData {
    readonly from?: string;
    readonly to?: string;

    utxos: UTXO[];

    nonWitnessUtxo?: Buffer;
    estimatedFees?: bigint;

    optionalInputs?: UTXO[];
    optionalOutputs?: PsbtOutputExtended[];

    chainId?: ChainId;
    noSignatures?: boolean;

    readonly note?: string | Buffer;
    readonly anchor?: boolean;

    readonly feeRate: number;
    readonly priorityFee: bigint;
    readonly gasSatFee: bigint;
}

export interface IFundingTransactionParameters extends ITransactionParameters {
    amount: bigint;

    splitInputsInto?: number;
}

export interface SharedInteractionParameters extends ITransactionParameters {
    calldata?: Buffer;
    disableAutoRefund?: boolean;

    readonly challenge: ChallengeSolution;
    readonly randomBytes?: Buffer;

    readonly loadedStorage?: LoadedStorage;
}

export interface IInteractionParameters extends SharedInteractionParameters {
    readonly calldata: Buffer;

    readonly to: string;
    readonly contract?: string;
}

export interface IDeploymentParameters extends Omit<ITransactionParameters, 'to'> {
    readonly bytecode: Buffer;
    readonly calldata?: Buffer;

    readonly randomBytes?: Buffer;
    readonly challenge: ChallengeSolution;
}
