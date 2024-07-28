import { IDeploymentParameters, IFundingTransactionParameters, IInteractionParameters, IUnwrapParameters, IWrapParameters } from './interfaces/ITransactionParameters.js';
import { UTXO } from '../utxo/interfaces/IUTXO.js';
import { Address } from '@btc-vision/bsi-binary';
export interface DeploymentResult {
    readonly transaction: [string, string];
    readonly contractAddress: Address;
    readonly p2trAddress: Address;
    readonly utxos: UTXO[];
}
export interface WrapResult {
    readonly transaction: [string, string];
    readonly vaultAddress: Address;
    readonly amount: bigint;
    readonly receiverAddress: Address;
    readonly utxos: UTXO[];
}
export interface UnwrapResult {
    readonly fundingTransaction: string;
    readonly psbt: string;
    readonly feeRefundOrLoss: bigint;
    readonly utxos: UTXO[];
}
export declare class TransactionFactory {
    constructor();
    signInteraction(interactionParameters: IInteractionParameters): Promise<[string, string, UTXO[]]>;
    signDeployment(deploymentParameters: IDeploymentParameters): Promise<DeploymentResult>;
    wrap(warpParameters: Omit<IWrapParameters, 'calldata'>): Promise<WrapResult>;
    unwrapSegwit(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult>;
    unwrap(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult>;
    createBTCTransfer(parameters: IFundingTransactionParameters): Promise<{
        estimatedFees: bigint;
        tx: string;
    }>;
    private createFundTransaction;
    private calculateNumSignatures;
    private calculateNumInputs;
    private maxPubKeySize;
    private writePSBTHeader;
    private getUTXOAsTransaction;
}
