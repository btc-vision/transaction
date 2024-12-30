import { TransactionType } from '../enums/TransactionType.js';
import { IFundingTransactionParameters } from '../interfaces/ITransactionParameters.js';
import { opcodes, script, Signer } from '@btc-vision/bitcoin';
import { TransactionBuilder } from './TransactionBuilder.js';
import { ECPairInterface } from 'ecpair';

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
            const pubKeyScript = script.compile([
                Buffer.from(this.to.replace('0x', ''), 'hex'),
                opcodes.OP_CHECKSIG,
            ]);

            this.addOutput({
                value: Number(this.amount),
                script: pubKeyScript,
            });
        } else {
            this.addOutput({
                value: Number(this.amount),
                address: this.to,
            });
        }

        await this.addRefundOutput(this.amount + this.addOptionalOutputsAndGetAmount());
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

    protected override getSignerKey(): Signer | ECPairInterface {
        return this.signer;
    }
}
