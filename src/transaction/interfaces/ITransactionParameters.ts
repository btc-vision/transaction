import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { Address } from '@btc-vision/bsi-binary';
import { WrappedGeneration } from '../../wbtc/WrappedGenerationParameters.js';
import { ITweakedTransactionData } from '../shared/TweakedTransaction.js';
import { VaultUTXOs } from '../processor/PsbtTransaction.js';
import { ChainId } from '../../network/ChainId.js';
import { PsbtOutputExtended } from './Tap.js';
export interface ITransactionParameters extends ITweakedTransactionData {
    readonly from?: Address;
    readonly to?: Address;
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

export interface SharedInteractionParameters extends ITransactionParameters {
    calldata?: Buffer;
    disableAutoRefund?: boolean;

    readonly randomBytes?: Buffer;
}

export interface IInteractionParameters
    extends Omit<SharedInteractionParameters, 'optionalOutputs'> {
    readonly calldata: Buffer;

    readonly to: Address;
}

export interface IWrapParameters extends Omit<SharedInteractionParameters, 'optionalOutputs'> {
    readonly to?: Address;

    readonly from: Address;
    readonly amount: bigint;
    readonly receiver?: Address;

    readonly generationParameters: WrappedGeneration;
}

export interface IUnwrapParameters extends Omit<SharedInteractionParameters, 'optionalOutputs'> {
    readonly unwrapUTXOs: VaultUTXOs[];
    readonly amount: bigint;
}

export interface IDeploymentParameters extends Omit<ITransactionParameters, 'to'> {
    readonly bytecode: Buffer;

    readonly randomBytes?: Buffer;
}
