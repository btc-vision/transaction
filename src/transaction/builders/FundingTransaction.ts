import { TransactionType } from '../enums/TransactionType.js';
import { IFundingTransactionParameters } from '../interfaces/ITransactionParameters.js';
import { Signer } from 'bitcoinjs-lib';
import { TransactionBuilder } from './TransactionBuilder.js';

export class FundingTransaction extends TransactionBuilder<TransactionType.FUNDING> {
    public readonly type: TransactionType.FUNDING = TransactionType.FUNDING;

    protected amount: bigint;
    protected splitInputsInto: number;

    constructor(parameters: IFundingTransactionParameters) {
        super(parameters);

        this.amount = parameters.amount;
        this.splitInputsInto = parameters.splitInputsInto ?? 1;

        this.internalInit();
    }

    protected override async buildTransaction(): Promise<void> {
        if (!this.to) {
            throw new Error('Recipient address is required');
        }

        this.addInputsFromUTXO();

        if (this.splitInputsInto > 1) {
            this.splitInputs(this.amount);
        } else if (this.isPubKeyDestination) {
            this.addOutput({
                value: Number(this.amount),
                script: Buffer.from(this.to.slice(2), 'hex'),
            });
        } else {
            this.addOutput({
                value: Number(this.amount),
                address: this.to,
            });
        }

        await this.addRefundOutput(this.amount);
    }

    protected splitInputs(amountSpent: bigint): void {
        if (!this.to) {
            throw new Error('Recipient address is required');
        }

        const splitAmount = amountSpent / BigInt(this.splitInputsInto);

        for (let i = 0; i < this.splitInputsInto; i++) {
            if (this.isPubKeyDestination) {
                this.addOutput({
                    value: Number(splitAmount),
                    script: Buffer.from(this.to.slice(2), 'hex'),
                });
            } else {
                this.addOutput({
                    value: Number(splitAmount),
                    address: this.to,
                });
            }
        }
    }

    protected override getSignerKey(): Signer {
        return this.signer;
    }
}
