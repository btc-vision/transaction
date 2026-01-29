import { TransactionType } from '../enums/TransactionType.js';
import { IFundingTransactionParameters } from '../interfaces/ITransactionParameters.js';
import { fromHex, opcodes, Script, script, Signer, toSatoshi } from '@btc-vision/bitcoin';
import { TransactionBuilder } from './TransactionBuilder.js';
import { type UniversalSigner } from '@btc-vision/ecpair';

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

        // Add the primary output(s) first
        if (this.splitInputsInto > 1) {
            this.splitInputs(this.amount);
        } else if (this.isPubKeyDestination) {
            const pubKeyScript: Script = script.compile([
                fromHex(this.to.replace('0x', '')),
                opcodes.OP_CHECKSIG,
            ]);

            this.addOutput({
                value: toSatoshi(this.amount),
                script: pubKeyScript,
            });
        } else {
            this.addOutput({
                value: toSatoshi(this.amount),
                address: this.to,
            });
        }

        // Calculate total amount needed for all outputs (including optional)
        const totalOutputAmount = this.amount + this.addOptionalOutputsAndGetAmount();

        // Add refund output - this will handle fee calculation properly
        await this.addRefundOutput(totalOutputAmount);
    }

    protected splitInputs(amountSpent: bigint): void {
        if (!this.to) {
            throw new Error('Recipient address is required');
        }

        const splitAmount = amountSpent / BigInt(this.splitInputsInto);

        for (let i = 0; i < this.splitInputsInto; i++) {
            if (this.isPubKeyDestination) {
                this.addOutput({
                    value: toSatoshi(splitAmount),
                    script: fromHex(this.to.slice(2)) as Script,
                });
            } else {
                this.addOutput({
                    value: toSatoshi(splitAmount),
                    address: this.to,
                });
            }
        }
    }

    protected override getSignerKey(): Signer | UniversalSigner {
        return this.signer;
    }
}
