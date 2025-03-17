import {
    IDeploymentParameters,
    IInteractionParameters,
} from '../interfaces/ITransactionParameters.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { DeploymentResult, InteractionResponse } from '../TransactionFactory';

export type InteractionParametersWithoutSigner = Omit<
    IInteractionParameters,
    'signer' | 'preimage'
>;

export type IDeploymentParametersWithoutSigner = Omit<
    IDeploymentParameters,
    'signer' | 'network' | 'preimage'
>;

export interface BroadcastTransactionOptions {
    raw: string;
    psbt: boolean;
}

export interface BroadcastedTransaction {
    /** Whether the transaction was successfully broadcasted. */
    readonly success: boolean;

    /**
     * The result of the broadcasted transaction.
     */
    readonly result?: string;

    /**
     * The error message if the transaction was not successfully broadcasted.
     */
    readonly error?: string;

    /**
     * The number of peers that the transaction was broadcasted to.
     */
    readonly peers?: number;

    /**
     * The identifier of the transaction.
     */
    readonly identifier: bigint | string;
}

export interface Web3Provider {
    signInteraction(
        interactionParameters: InteractionParametersWithoutSigner,
    ): Promise<InteractionResponse>;

    signAndBroadcastInteraction(
        interactionParameters: InteractionParametersWithoutSigner,
    ): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[], string]>;

    deployContract(params: IDeploymentParametersWithoutSigner): Promise<DeploymentResult>;

    broadcast(transactions: BroadcastTransactionOptions[]): Promise<BroadcastedTransaction[]>;
}
