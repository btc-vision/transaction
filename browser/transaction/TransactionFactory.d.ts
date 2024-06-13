import { IDeploymentParameters, IInteractionParameters, IUnwrapParameters, IWrapParameters } from './interfaces/ITransactionParameters.js';
import { Address } from '@btc-vision/bsi-binary';
import { UnwrapTransaction } from './builders/UnwarpTransaction.js';
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
export interface UnwrapResult {
    readonly fundingTransaction: string;
    readonly psbt: string;
    readonly original: UnwrapTransaction;
}
export declare class TransactionFactory {
    signInteraction(interactionParameters: IInteractionParameters): [string, string];
    signDeployment(deploymentParameters: IDeploymentParameters): DeploymentResult;
    wrap(warpParameters: IWrapParameters): WrapResult;
    unwrap(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult>;
    private writePSBTHeader;
    private getUTXOAsTransaction;
    private createFundTransaction;
}
