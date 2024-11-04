import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { WrappedGeneration } from '../../wbtc/WrappedGenerationParameters.js';
import { ITweakedTransactionData } from '../shared/TweakedTransaction.js';
import { VaultUTXOs } from '../processor/PsbtTransaction.js';
import { ChainId } from '../../network/ChainId.js';
import { Address } from '../../keypair/Address.js';
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

export interface SharedInteractionParameters extends ITransactionParameters {
    calldata?: Buffer;
    disableAutoRefund?: boolean;

    readonly randomBytes?: Buffer;
}

export interface IInteractionParameters
    extends Omit<SharedInteractionParameters, 'optionalOutputs'> {
    readonly calldata: Buffer;

    readonly to: string;
}

export interface IWrapParameters extends Omit<SharedInteractionParameters, 'optionalOutputs'> {
    readonly to?: string;
    readonly from: string;

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
    readonly calldata?: Buffer;

    readonly randomBytes?: Buffer;
}
