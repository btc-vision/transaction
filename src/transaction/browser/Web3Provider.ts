import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';

export type InteractionParametersWithoutSigner = Omit<IInteractionParameters, 'signer'>; //| 'utxos'

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
    ): Promise<[string, string, UTXO[]]>;

    signAndBroadcastInteraction(
        interactionParameters: InteractionParametersWithoutSigner,
    ): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[]]>;

    broadcast(transactions: BroadcastTransactionOptions[]): Promise<BroadcastedTransaction[]>;
}
