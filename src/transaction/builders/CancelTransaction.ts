import { TransactionType } from '../enums/TransactionType.js';
import { P2TRPayment, PaymentType, Psbt, PsbtInput, Taptree } from '@btc-vision/bitcoin';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { ITransactionParameters, SharedInteractionParameters, } from '../interfaces/ITransactionParameters.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';

export interface ICancelTransactionParameters
    extends Omit<ITransactionParameters, 'priorityFee' | 'gasSatFee'> {
    readonly compiledTargetScript: string | Buffer;
}

export class CancelTransaction extends TransactionBuilder<TransactionType.CANCEL> {
    public type: TransactionType.CANCEL = TransactionType.CANCEL;

    /**
     * The tap leaf script for spending
     */
    protected tapLeafScript: TapLeafScript | null = null;

    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;

    protected readonly contractSecret: Buffer;
    protected leftOverFundsScriptRedeem: P2TRPayment | null = null;

    public constructor(parameters: ICancelTransactionParameters) {
        super({
            ...parameters,
            gasSatFee: 1n,
            isCancellation: true,
            priorityFee: 1n,
            calldata: Buffer.alloc(0),
        } as unknown as SharedInteractionParameters);

        this.contractSecret = Buffer.alloc(0);

        if (Buffer.isBuffer(parameters.compiledTargetScript)) {
            this.compiledTargetScript = parameters.compiledTargetScript;
        } else {
            this.compiledTargetScript = Buffer.from(parameters.compiledTargetScript, 'hex');
        }

        // Generate the minimal script tree needed for recovery
        this.scriptTree = this.getMinimalScriptTree();

        this.internalInit();
    }

    protected override async buildTransaction(): Promise<void> {
        if (!this.from) {
            throw new Error('From address is required');
        }

        if (!this.leftOverFundsScriptRedeem) {
            throw new Error('Left over funds script redeem is required');
        }

        if (!this.leftOverFundsScriptRedeem.redeemVersion) {
            throw new Error('Left over funds script redeem version is required');
        }

        if (!this.leftOverFundsScriptRedeem.output) {
            throw new Error('Left over funds script redeem output is required');
        }

        // Set up the tap leaf script for spending
        this.tapLeafScript = {
            leafVersion: this.leftOverFundsScriptRedeem.redeemVersion,
            script: this.leftOverFundsScriptRedeem.output,
            controlBlock: this.getWitness(),
        };

        this.addInputsFromUTXO();

        await this.addRefundOutput(0n, true);

        if (!this.feeOutput) {
            throw new Error('Must add extra UTXOs to cancel this transaction');
        }
    }

    /*protected override async buildTransaction(): Promise<void> {
        if (!this.from) {
            throw new Error('From address is required');
        }

        // For key-path spend, we don't need the tap leaf script
        this.tapLeafScript = null;

        this.addInputsFromUTXO();
        await this.addRefundOutput(0n);
    }*/

    /**
     * Sign the inputs
     * @param {Psbt} transaction The transaction to sign
     * @protected
     */
    /*protected async signInputs(transaction: Psbt): Promise<void> {
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            if (i === 0) {
                transaction.signInput(0, this.getSignerKey());

                transaction.finalizeInput(0, this.customFinalizer.bind(this));
            } else {
                await super.signInputs(transaction);
            }
        }
    }*/

    /**
     * Generate the script address (for verification purposes)
     */
    protected override generateScriptAddress(): P2TRPayment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
            name: PaymentType.P2TR,
        };
    }

    /**
     * Generate the tap data for spending
     */
    /*protected override generateTapData(): P2TRPayment {
        const internalPubkey = this.internalPubKeyToXOnly();

        return {
            name: PaymentType.P2TR,
            internalPubkey: internalPubkey,
            network: this.network,
            scriptTree: this.scriptTree, // This is crucial for the tweak
        };
    }*/
    protected override generateTapData(): P2TRPayment {
        const selectedRedeem = this.leftOverFundsScriptRedeem;

        if (!selectedRedeem) {
            throw new Error('Left over funds script redeem is required');
        }

        if (!this.scriptTree) {
            throw new Error('Script tree is required');
        }

        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
            redeem: selectedRedeem,
            name: PaymentType.P2TR,
        };
    }

    /**
     * Custom finalizer for the tap script spend
     */
    protected customFinalizer = (_inputIndex: number, input: PsbtInput) => {
        if (!this.tapLeafScript) {
            throw new Error('Tap leaf script is required');
        }

        if (!input.tapScriptSig || input.tapScriptSig.length === 0) {
            throw new Error('Tap script signature is required');
        }

        // For the simple lock script, we only need the signature
        const scriptSolution = [input.tapScriptSig[0].signature];

        const witness = scriptSolution
            .concat(this.tapLeafScript.script)
            .concat(this.tapLeafScript.controlBlock);

        return {
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witness),
        };
    };

    protected override async signInputs(transaction: Psbt): Promise<void> {
        if ('multiSignPsbt' in this.signer) {
            await this.signInputsWalletBased(transaction);
        } else {
            await this.signInputsNonWalletBased(transaction);
        }
    }

    protected override async signInputsWalletBased(transaction: Psbt): Promise<void> {
        const signer: UnisatSigner = this.signer as UnisatSigner;

        // then, we sign all the remaining inputs with the wallet signer.
        await signer.multiSignPsbt([transaction]);

        // Then, we finalize every input.
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            if (i === 0) {
                transaction.finalizeInput(i, this.customFinalizer.bind(this));
            } else {
                try {
                    transaction.finalizeInput(i, this.customFinalizerP2SH.bind(this));
                } catch (e) {
                    transaction.finalizeInput(i);
                }
            }
        }
    }

    protected override async signInputsNonWalletBased(transaction: Psbt): Promise<void> {
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            if (i === 0) {
                await this.signInput(
                    transaction,
                    transaction.data.inputs[i],
                    i,
                    this.getSignerKey(),
                );

                transaction.finalizeInput(0, this.customFinalizer.bind(this));
            } else {
                await this.signInput(transaction, transaction.data.inputs[i], i, this.signer);

                try {
                    transaction.finalizeInput(i, this.customFinalizerP2SH.bind(this));
                } catch (e) {
                    transaction.finalizeInput(i);
                }
            }
        }
    }

    /**
     * Generate the minimal script tree needed for recovery
     * This only includes the leftover funds script
     */
    private getMinimalScriptTree(): Taptree {
        this.generateLeftoverFundsRedeem();

        if (!this.leftOverFundsScriptRedeem || !this.leftOverFundsScriptRedeem.output) {
            throw new Error('Failed to generate leftover funds redeem script');
        }

        return [
            {
                output: this.compiledTargetScript,
                version: 192,
            },
            {
                output: this.leftOverFundsScriptRedeem.output,
                version: 192,
            },
        ];
    }

    /**
     * Generate the leftover funds redeem script
     */
    private generateLeftoverFundsRedeem(): void {
        // Use the same LOCK_LEAF_SCRIPT from the parent class
        this.leftOverFundsScriptRedeem = {
            name: PaymentType.P2TR,
            output: this.LOCK_LEAF_SCRIPT,
            redeemVersion: 192,
        };
    }
}
