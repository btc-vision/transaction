import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';

export type InteractionParametersWithoutSigner = Omit<IInteractionParameters, 'signer'>; //| 'utxos'

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
    ): Promise<[BroadcastedTransaction, BroadcastedTransaction]>;
}
