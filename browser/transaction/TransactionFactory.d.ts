import { IDeploymentParameters, IInteractionParameters, IWrapParameters } from './interfaces/ITransactionParameters.js';
import { Address } from '@btc-vision/bsi-binary';
export interface DeploymentResult {
    readonly transaction: [string, string];
    readonly contractAddress: Address;
    readonly p2trAddress: Address;
}
export interface WrapResult {
    readonly transaction: [string, string];
    readonly vaultAddress: Address;
    readonly amount: bigint;
    readonly receiverAddress: Address;
}
export declare class TransactionFactory {
    signInteraction(interactionParameters: IInteractionParameters): [string, string];
    signDeployment(deploymentParameters: IDeploymentParameters): DeploymentResult;
    wrap(warpParameters: IWrapParameters): WrapResult;
    private getUTXOAsTransaction;
    private createFundTransaction;
}
