import { TransactionType } from '../enums/TransactionType.js';
import {
    type FinalScriptsFunc,
    fromHex,
    type P2TRPayment,
    PaymentType,
    Psbt,
    type PsbtInput,
    type TapScriptSig,
    type Taptree,
} from '@btc-vision/bitcoin';
import { TransactionBuilder } from './TransactionBuilder.js';
import type { TapLeafScript } from '../interfaces/Tap.js';
import type { ICancelTransactionParameters } from '../interfaces/ICancelTransactionParameters.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';
import type { SharedInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { isUniversalSigner } from '../../signer/TweakedSigner.js';

export class CancelTransaction extends TransactionBuilder<TransactionType.CANCEL> {
    public type: TransactionType.CANCEL = TransactionType.CANCEL;

    /**
     * The tap leaf script for spending
     */
    protected override tapLeafScript: TapLeafScript | null = null;

    protected readonly compiledTargetScript: Uint8Array;
    protected readonly scriptTree: Taptree;

    protected readonly contractSecret: Uint8Array;
    protected leftOverFundsScriptRedeem: P2TRPayment | null = null;

    public constructor(parameters: ICancelTransactionParameters) {
        super({
            ...parameters,
            gasSatFee: 1n,
            isCancellation: true,
            priorityFee: 1n,
            calldata: new Uint8Array(0),
        } as unknown as SharedInteractionParameters);

        this.contractSecret = new Uint8Array(0);

        if (parameters.compiledTargetScript instanceof Uint8Array) {
            this.compiledTargetScript = parameters.compiledTargetScript;
        } else {
            this.compiledTargetScript = fromHex(parameters.compiledTargetScript);
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
        const scriptSolution = [(input.tapScriptSig[0] as TapScriptSig).signature];

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
        // Input 0: always sequential (script-path with custom finalizer)
        await this.signInput(
            transaction,
            transaction.data.inputs[0] as PsbtInput,
            0,
            this.getSignerKey(),
        );
        transaction.finalizeInput(0, this.customFinalizer.bind(this));

        // Inputs 1+: parallel key-path if available, then sequential for remaining
        let parallelSignedIndices = new Set<number>();

        if (this.canUseParallelSigning && isUniversalSigner(this.signer)) {
            try {
                const result = await this.signKeyPathInputsParallel(transaction, new Set([0]));
                if (result.success) {
                    parallelSignedIndices = new Set(result.signatures.keys());
                }
            } catch (e) {
                this.error(
                    `Parallel signing failed, falling back to sequential: ${(e as Error).message}`,
                );
            }
        }

        for (let i = 1; i < transaction.data.inputs.length; i++) {
            if (!parallelSignedIndices.has(i)) {
                await this.signInput(
                    transaction,
                    transaction.data.inputs[i] as PsbtInput,
                    i,
                    this.signer,
                );
            }
        }

        // Finalize inputs 1+
        for (let i = 1; i < transaction.data.inputs.length; i++) {
            try {
                transaction.finalizeInput(
                    i,
                    this.customFinalizerP2SH.bind(this) as FinalScriptsFunc,
                );
            } catch {
                transaction.finalizeInput(i);
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
