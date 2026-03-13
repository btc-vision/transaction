import { TransactionType } from '../enums/TransactionType.js';
import type { IFundingTransactionParameters } from '../interfaces/ITransactionParameters.js';
import { fromHex, opcodes, type Script, script, type Signer, toSatoshi } from '@btc-vision/bitcoin';
import { TransactionBuilder } from './TransactionBuilder.js';
import { type UniversalSigner } from '@btc-vision/ecpair';

export class FundingTransaction extends TransactionBuilder<TransactionType.FUNDING> {
    public readonly type: TransactionType.FUNDING = TransactionType.FUNDING;

    protected amount: bigint;
    protected splitInputsInto: number;
    protected autoAdjustAmount: boolean;

    constructor(parameters: IFundingTransactionParameters) {
        const mergedParams = parameters.feeUtxos?.length
            ? { ...parameters, utxos: [...parameters.utxos, ...parameters.feeUtxos] }
            : parameters;
        super(mergedParams);

        this.amount = parameters.amount;
        this.splitInputsInto = parameters.splitInputsInto ?? 1;
        this.autoAdjustAmount = parameters.autoAdjustAmount ?? false;

        this.internalInit();
    }

    protected override async buildTransaction(): Promise<void> {
        if (!this.to) {
            throw new Error('Recipient address is required');
        }

        this.addInputsFromUTXO();

        // When autoAdjustAmount is enabled and the amount would leave no room for fees,
        // estimate the fee first and reduce the output amount accordingly.
        if (this.autoAdjustAmount && this.amount >= this.totalInputAmount) {
            // Add temporary outputs matching the ACTUAL final transaction shape
            // so the fee estimate accounts for the real vsize.
            const numOutputs = this.splitInputsInto > 1 ? this.splitInputsInto : 1;
            const perOutputAmount = this.amount / BigInt(numOutputs);

            for (let i = 0; i < numOutputs; i++) {
                if (this.isPubKeyDestination) {
                    const toHexClean = this.to.startsWith('0x') ? this.to.slice(2) : this.to;
                    const pubKeyScript: Script = script.compile([
                        fromHex(toHexClean),
                        opcodes.OP_CHECKSIG,
                    ]);

                    this.addOutput({
                        value: toSatoshi(perOutputAmount),
                        script: pubKeyScript,
                    });
                } else {
                    this.addOutput({
                        value: toSatoshi(perOutputAmount),
                        address: this.to,
                    });
                }
            }

            // If a note is present, add a temporary OP_RETURN since it affects vsize.
            if (this.note) {
                this.addOPReturn(this.note);
            }

            const estimatedFee = await this.estimateTransactionFees();

            // Remove all temporary outputs.
            const tempCount = numOutputs + (this.note ? 1 : 0);
            for (let i = 0; i < tempCount; i++) {
                this.outputs.pop();
            }

            const adjustedAmount = this.totalInputAmount - estimatedFee;
            if (adjustedAmount < TransactionBuilder.MINIMUM_DUST) {
                throw new Error(
                    `Insufficient funds: after deducting fee of ${estimatedFee} sats, remaining amount ${adjustedAmount} sats is below minimum dust`,
                );
            }

            this.amount = adjustedAmount;
        }

        // Add the primary output(s) first
        if (this.splitInputsInto > 1) {
            this.splitInputs(this.amount);
        } else if (this.isPubKeyDestination) {
            const toHexClean = this.to.startsWith('0x') ? this.to.slice(2) : this.to;
            const pubKeyScript: Script = script.compile([
                fromHex(toHexClean),
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
