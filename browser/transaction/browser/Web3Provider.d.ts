import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
export type InteractionParametersWithoutSigner = Omit<IInteractionParameters, 'signer'>;
export interface BroadcastTransactionOptions {
    raw: string;
    psbt: boolean;
}
export interface BroadcastedTransaction {
    readonly success: boolean;
    readonly result?: string;
    readonly error?: string;
    readonly peers?: number;
    readonly identifier: bigint | string;
}
export interface Web3Provider {
    signInteraction(interactionParameters: InteractionParametersWithoutSigner): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[]]>;
    signAndBroadcastInteraction(interactionParameters: InteractionParametersWithoutSigner): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[]]>;
    broadcast(transactions: BroadcastTransactionOptions[]): Promise<BroadcastedTransaction[]>;
}
