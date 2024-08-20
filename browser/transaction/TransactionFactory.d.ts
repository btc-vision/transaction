import { Transaction } from 'bitcoinjs-lib';
import { IDeploymentParameters, IFundingTransactionParameters, IInteractionParameters, IUnwrapParameters, IWrapParameters } from './interfaces/ITransactionParameters.js';
import { FundingTransaction } from './builders/FundingTransaction.js';
import { UTXO } from '../utxo/interfaces/IUTXO.js';
import { Address } from '@btc-vision/bsi-binary';
import { TransactionBuilder } from './builders/TransactionBuilder.js';
import { TransactionType } from './enums/TransactionType.js';
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
export interface FundingTransactionResponse {
    readonly tx: Transaction;
    readonly original: FundingTransaction;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
}
export interface BitcoinTransferResponse {
    readonly tx: string;
    readonly original: FundingTransaction;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
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
    wrap(wrapParameters: Omit<IWrapParameters, 'calldata'>): Promise<WrapResult>;
    unwrapSegwit(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult>;
    unwrap(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult>;
    createBTCTransfer(parameters: IFundingTransactionParameters): Promise<BitcoinTransferResponse>;
    getAllNewUTXOs(original: TransactionBuilder<TransactionType>, tx: Transaction, to: Address): UTXO[];
    private createFundTransaction;
    private calculateNumSignatures;
    private calculateNumInputs;
    private maxPubKeySize;
    private writePSBTHeader;
    private getUTXOAsTransaction;
}
