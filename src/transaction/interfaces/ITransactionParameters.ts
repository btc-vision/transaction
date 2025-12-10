import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ITweakedTransactionData } from '../shared/TweakedTransaction.js';
import { ChainId } from '../../network/ChainId.js';
import { PsbtOutputExtended } from '@btc-vision/bitcoin';
import { ChallengeSolution } from '../../epoch/ChallengeSolution.js';
import { AddressRotationConfig } from '../../signer/AddressRotation.js';

export interface LoadedStorage {
    [key: string]: string[];
}

export interface ITransactionParameters extends ITweakedTransactionData {
    readonly from?: string;
    readonly to?: string;
    readonly debugFees?: boolean;

    /**
     * Reveal this user's MLDSA public key in the transaction features.
     */
    readonly revealMLDSAPublicKey?: boolean;

    /**
     * Link the user MLDSA public key to their legacy public key.
     */
    readonly linkMLDSAPublicKeyToAddress?: boolean;

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

    readonly compiledTargetScript?: Buffer | string;

    /**
     * Address rotation configuration.
     * When enabled, allows different signers to sign different UTXOs based on their addresses.
     * This supports proper Bitcoin privacy practices where each UTXO has its own key.
     */
    readonly addressRotation?: AddressRotationConfig;
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
    readonly isCancellation?: boolean;
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
