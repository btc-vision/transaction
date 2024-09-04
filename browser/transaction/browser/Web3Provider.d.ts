import { IDeploymentParameters, IInteractionParameters, IUnwrapParameters, IWrapParameters } from '../interfaces/ITransactionParameters.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { DeploymentResult, UnwrapResult, WrapResult } from '../TransactionFactory';
export type InteractionParametersWithoutSigner = Omit<IInteractionParameters, 'signer'>;
export type IWrapParametersWithoutSigner = Omit<IWrapParameters, 'signer'>;
export type IUnwrapParametersWithoutSigner = Omit<IUnwrapParameters, 'signer'>;
export type IDeploymentParametersWithoutSigner = Omit<IDeploymentParameters, 'signer' | 'network'>;
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
    signInteraction(interactionParameters: InteractionParametersWithoutSigner): Promise<[string, string, UTXO[]]>;
    signAndBroadcastInteraction(interactionParameters: InteractionParametersWithoutSigner): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[]]>;
    deployContract(params: IDeploymentParametersWithoutSigner): Promise<DeploymentResult>;
    broadcast(transactions: BroadcastTransactionOptions[]): Promise<BroadcastedTransaction[]>;
    wrap(wrapParameters: IWrapParametersWithoutSigner): Promise<WrapResult>;
    unwrap(unwrapParameters: IUnwrapParametersWithoutSigner): Promise<UnwrapResult>;
}
