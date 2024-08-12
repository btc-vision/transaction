import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { Address } from '@btc-vision/bsi-binary';
import { WrappedGeneration } from '../../wbtc/WrappedGenerationParameters.js';
import { ITweakedTransactionData } from '../shared/TweakedTransaction.js';
import { VaultUTXOs } from '../processor/PsbtTransaction.js';
import { ChainId } from '../../network/ChainId.js';

export interface ITransactionParameters extends ITweakedTransactionData {
    readonly from?: Address;
    readonly to?: Address | undefined;
    utxos: UTXO[];

    nonWitnessUtxo?: Buffer | undefined;
    estimatedFees?: bigint;

    chainId?: ChainId;

    readonly feeRate: number;
    readonly priorityFee: bigint;
}

export interface IFundingTransactionParameters extends ITransactionParameters {
    amount: bigint;
}

export interface SharedInteractionParameters extends ITransactionParameters {
    calldata?: Buffer | undefined;
    disableAutoRefund?: boolean;

    readonly randomBytes?: Buffer;
}

export interface IInteractionParameters extends SharedInteractionParameters {
    readonly calldata: Buffer;

    readonly to: Address;
}

export interface IWrapParameters extends SharedInteractionParameters {
    readonly to?: Address;

    readonly from: Address;
    readonly amount: bigint;
    readonly receiver?: Address;

    readonly generationParameters: WrappedGeneration;
}

export interface IUnwrapParameters extends SharedInteractionParameters {
    readonly unwrapUTXOs: VaultUTXOs[];
    readonly amount: bigint;
}

export interface IDeploymentParameters extends ITransactionParameters {
    readonly bytecode: Buffer;

    readonly to?: undefined;
    readonly randomBytes?: Buffer;
}
