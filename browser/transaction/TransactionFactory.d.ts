import { IDeploymentParameters, IInteractionParameters, IUnwrapParameters, IWrapParameters } from './interfaces/ITransactionParameters.js';
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
export interface UnwrapResult {
    readonly fundingTransaction: string;
    readonly psbt: string;
    readonly feeRefundOrLoss: bigint;
}
export declare class TransactionFactory {
    constructor();
    signInteraction(interactionParameters: IInteractionParameters): Promise<[string, string]>;
    signDeployment(deploymentParameters: IDeploymentParameters): Promise<DeploymentResult>;
    wrap(warpParameters: IWrapParameters): Promise<WrapResult>;
    unwrapSegwit(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult>;
    unwrap(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult>;
    private calculateNumSignatures;
    private calculateNumInputs;
    private maxPubKeySize;
    private writePSBTHeader;
    private getUTXOAsTransaction;
    private createFundTransaction;
}
