import { Signer } from 'bitcoinjs-lib';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { Network } from 'bitcoinjs-lib/src/networks.js';
import { Address } from '@btc-vision/bsi-binary';
import { WrappedGeneration } from '../../wbtc/WrappedGenerationParameters.js';

export interface ITransactionParameters {
    readonly from?: Address;
    readonly to?: Address | undefined;
    utxos: UTXO[];

    nonWitnessUtxo?: Buffer | undefined;

    readonly signer: Signer;
    readonly network: Network;
    readonly feeRate: number;
    readonly priorityFee: bigint;
}

export interface IFundingTransactionParameters extends ITransactionParameters {
    childTransactionRequiredValue: bigint;
}

export interface SharedInteractionParameters extends ITransactionParameters {
    calldata?: Buffer | undefined;

    readonly randomBytes?: Buffer;
}

export interface IInteractionParameters extends SharedInteractionParameters {
    readonly calldata: Buffer;

    readonly to: Address;
}

export interface IWrapParameters extends SharedInteractionParameters {
    readonly to?: undefined;

    readonly amount: bigint;
    readonly receiver?: Address;

    readonly generationParameters: WrappedGeneration;
}

export interface IDeploymentParameters extends ITransactionParameters {
    readonly bytecode: Buffer;

    readonly to?: undefined;
    readonly randomBytes?: Buffer;
}
