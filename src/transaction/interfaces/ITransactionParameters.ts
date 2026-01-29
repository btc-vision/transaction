import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ITweakedTransactionData } from './ITweakedTransactionData.js';
import { ChainId } from '../../network/ChainId.js';
import { PsbtOutputExtended } from '@btc-vision/bitcoin';
import { IChallengeSolution } from '../../epoch/interfaces/IChallengeSolution.js';
import { AddressRotationConfigBase } from '../../signer/IRotationSigner.js';

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

    nonWitnessUtxo?: Uint8Array;
    estimatedFees?: bigint;

    optionalInputs?: UTXO[];
    optionalOutputs?: PsbtOutputExtended[];

    chainId?: ChainId;
    noSignatures?: boolean;

    readonly note?: string | Uint8Array;
    readonly anchor?: boolean;

    readonly feeRate: number;
    readonly priorityFee: bigint;
    readonly gasSatFee: bigint;

    readonly compiledTargetScript?: Uint8Array | string;

    /**
     * Address rotation configuration.
     * When enabled, allows different signers to sign different UTXOs based on their addresses.
     * This supports proper Bitcoin privacy practices where each UTXO has its own key.
     */
    readonly addressRotation?: AddressRotationConfigBase;
}

export interface IFundingTransactionParameters extends ITransactionParameters {
    amount: bigint;

    splitInputsInto?: number;
}

export interface SharedInteractionParameters extends ITransactionParameters {
    calldata?: Uint8Array;
    disableAutoRefund?: boolean;

    readonly challenge: IChallengeSolution;
    readonly randomBytes?: Uint8Array;

    readonly loadedStorage?: LoadedStorage;
    readonly isCancellation?: boolean;
}

export interface IInteractionParameters extends SharedInteractionParameters {
    readonly calldata: Uint8Array;

    readonly to: string;
    readonly contract?: string;
}

export interface IDeploymentParameters extends Omit<ITransactionParameters, 'to'> {
    readonly bytecode: Uint8Array;
    readonly calldata?: Uint8Array;

    readonly randomBytes?: Uint8Array;
    readonly challenge: IChallengeSolution;
}
