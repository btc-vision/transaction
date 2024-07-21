import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
export type InteractionParametersWithoutSigner = Omit<IInteractionParameters, 'signer'>;
export interface BroadcastedTransaction {
    readonly success: boolean;
    readonly result?: string;
    readonly error?: string;
    readonly peers?: number;
    readonly identifier: bigint | string;
}
export interface Web3Provider {
    signInteraction(interactionParameters: InteractionParametersWithoutSigner): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[]]>;
}
