import { TransactionType } from '../enums/TransactionType.js';
import { IFundingTransactionParameters } from '../interfaces/ITransactionParameters.js';
import { Signer } from 'bitcoinjs-lib';
import { TransactionBuilder } from './TransactionBuilder.js';
export declare class FundingTransaction extends TransactionBuilder<TransactionType.FUNDING> {
    readonly type: TransactionType.FUNDING;
    protected childTransactionRequiredFees: bigint;
    constructor(parameters: IFundingTransactionParameters);
    protected buildTransaction(): void;
    protected getSignerKey(): Signer;
}
