import { TransactionType } from '../enums/TransactionType.js';
import { IFundingTransactionParameters } from '../interfaces/ITransactionParameters.js';
import { Signer } from 'bitcoinjs-lib';
import { TransactionBuilder } from './TransactionBuilder.js';

export class FundingTransaction extends TransactionBuilder<TransactionType.FUNDING> {
    public readonly type: TransactionType.FUNDING = TransactionType.FUNDING;

    protected childTransactionRequiredFees: bigint;

    constructor(parameters: IFundingTransactionParameters) {
        super(parameters);

        this.childTransactionRequiredFees = parameters.childTransactionRequiredValue;

        this.internalInit();
    }

    protected override buildTransaction(): void {
        if (!this.to) {
            throw new Error('Recipient address is required');
        }

        this.addInputsFromUTXO();

        const amountSpent: bigint =
            this.getTransactionOPNetFee() + this.childTransactionRequiredFees;

        this.addOutput({
            value: Number(amountSpent),
            address: this.to,
        });

        this.addRefundOutput(amountSpent);
    }

    protected override getSignerKey(): Signer {
        return this.signer;
    }
}
