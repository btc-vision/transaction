import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import {
    crypto,
    Network,
    opcodes,
    Payment,
    Psbt,
    script,
    Signer,
    Transaction,
} from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TransactionType } from '../enums/TransactionType.js';
import { ITransactionParameters } from '../interfaces/ITransactionParameters.js';
import { MultiSignGenerator } from '../../generators/builders/MultiSignGenerator.js';
import { PsbtInputExtended, PsbtOutputExtended } from '../interfaces/Tap.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { Address } from '@btc-vision/bsi-binary';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';

export interface MultiSignParameters
    extends Omit<ITransactionParameters, 'signer' | 'priorityFee'> {
    readonly pubkeys: Buffer[];
    readonly minimumSignatures: number;
    readonly from?: undefined;
    readonly to?: undefined;
    readonly psbt?: Psbt;
    readonly receiver: Address;
    readonly requestedAmount: bigint;
    readonly refundVault: Address;
}

export interface MultiSignFromBase64Params extends Omit<MultiSignParameters, 'psbt'> {
    readonly psbt: string;
}

/**
 * Create a multi sign p2tr transaction
 * @class MultiSignTransaction
 */
export class MultiSignTransaction extends TransactionBuilder<TransactionType.MULTI_SIG> {
    public static readonly LOCK_LEAF_SCRIPT: Buffer = script.compile([
        opcodes.OP_XOR,
        opcodes.OP_NOP,
        opcodes.OP_CODESEPARATOR,
    ]);

    public static readonly signHashTypesArray: number[] = [
        Transaction.SIGHASH_ALL,
        Transaction.SIGHASH_ANYONECANPAY,
    ];

    public type: TransactionType.MULTI_SIG = TransactionType.MULTI_SIG;

    protected targetScriptRedeem: Payment | null = null;
    protected leftOverFundsScriptRedeem: Payment | null = null;

    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;

    protected readonly multisignGenerator: MultiSignGenerator;

    protected readonly publicKeys: Buffer[];
    protected readonly minimumSignatures: number;

    protected readonly originalInputCount: number = 0;

    protected readonly requestedAmount: bigint;
    protected readonly receiver: Address;
    protected readonly refundVault: Address;

    /**
     * @description Sign hash types
     * @protected
     */
    protected readonly sighashTypes: number[] = MultiSignTransaction.signHashTypesArray;

    public constructor(parameters: MultiSignParameters) {
        if (!parameters.refundVault) {
            throw new Error('Refund vault is required');
        }

        if (!parameters.requestedAmount) {
            throw new Error('Requested amount is required');
        }

        if (!parameters.receiver) {
            throw new Error('Receiver is required');
        }

        const opnetVaultGenericWallet = MultiSignTransaction.getSharedSigner(parameters.network);
        super({ ...parameters, signer: opnetVaultGenericWallet, priorityFee: 0n });

        if (!parameters.pubkeys) {
            throw new Error('Pubkeys are required');
        }

        if (parameters.psbt) {
            this.log(`Using provided PSBT.`);
            this.transaction = parameters.psbt;

            this.originalInputCount = this.transaction.data.inputs.length;
        }

        this.refundVault = parameters.refundVault;
        this.requestedAmount = parameters.requestedAmount;
        this.receiver = parameters.receiver;

        this.publicKeys = parameters.pubkeys;
        this.minimumSignatures = parameters.minimumSignatures;

        this.multisignGenerator = new MultiSignGenerator(
            toXOnly(this.signer.publicKey),
            parameters.pubkeys,
            this.minimumSignatures,
            this.network,
        );

        this.compiledTargetScript = this.multisignGenerator.compile();

        this.scriptTree = this.getScriptTree();
        this.internalInit();
    }

    public static getSharedSigner(network: Network): Signer {
        const opnetHash = crypto.sha256(Buffer.from('OP_NET'));
        return EcKeyPair.fromSeedKeyPair(opnetHash, network);
    }

    /**
     * Generate a multisig transaction from a base64 psbt.
     * @param {MultiSignFromBase64Params} params The parameters
     * @returns {MultiSignTransaction} The multisig transaction
     */
    public static fromBase64(params: MultiSignFromBase64Params): MultiSignTransaction {
        const psbt = Psbt.fromBase64(params.psbt, { network: params.network });
        return new MultiSignTransaction({ ...params, psbt });
    }

    /**
     * Partially sign the transaction
     * @returns {boolean} True if the transaction was signed
     * @public
     */
    public static signPartial(
        psbt: Psbt,
        signer: Signer,
        originalInputCount: number,
        network: Network,
    ): boolean {
        let signed: boolean = false;

        const calculatedSignHash = [
            MultiSignTransaction.calculateSignHash(MultiSignTransaction.signHashTypesArray),
        ];

        const opnetVaultGenericWallet = MultiSignTransaction.getSharedSigner(network);
        for (let i = originalInputCount; i < psbt.data.inputs.length; i++) {
            let input: PsbtInput = psbt.data.inputs[i];
            if (!input.tapInternalKey) {
                input.tapInternalKey = toXOnly(opnetVaultGenericWallet.publicKey);
            }

            if (input.finalScriptWitness) {
                const decoded = TransactionBuilder.readScriptWitnessToWitnessStack(
                    input.finalScriptWitness,
                );

                input.tapLeafScript = [
                    {
                        leafVersion: 192,
                        script: decoded[0],
                        controlBlock: decoded[1],
                    },
                ];
            }

            console.log(`Attempting to partially sign input ${i}.`, input);

            try {
                MultiSignTransaction.signInput(psbt, input, i, signer, calculatedSignHash);

                delete input.tapLeafScript;
                delete input.tapInternalKey;

                signed = true;
            } catch (e) {
                console.log(e);
            }
        }

        return signed;
    }

    public static partialFinalizer = (inputIndex: number, input: PsbtInput) => {
        if (
            !input.tapLeafScript ||
            !input.tapLeafScript[0].script ||
            !input.tapLeafScript[0].controlBlock
        ) {
            throw new Error('Tap leaf script is required');
        }

        if (!input.tapScriptSig) {
            throw new Error(`No new signatures for input ${inputIndex}.`);
        }

        const scriptSolution = input.tapScriptSig.map((sig) => {
            return sig.signature;
        });

        const witness = scriptSolution
            .concat(input.tapLeafScript[0].script)
            .concat(input.tapLeafScript[0].controlBlock);

        console.log(input);

        return {
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witness),
        };
    };

    public static attemptFinalizeInputs(psbt: Psbt, startIndex: number, network: Network): boolean {
        let finalizedInputs = 0;
        for (let i = startIndex; i < psbt.data.inputs.length; i++) {
            try {
                let input = psbt.data.inputs[i];

                const opnetVaultGenericWallet = MultiSignTransaction.getSharedSigner(network);
                if (!input.tapInternalKey) {
                    input.tapInternalKey = toXOnly(opnetVaultGenericWallet.publicKey);
                }

                if (input.finalScriptWitness) {
                    const decoded = TransactionBuilder.readScriptWitnessToWitnessStack(
                        input.finalScriptWitness,
                    );

                    input.tapLeafScript = [
                        {
                            leafVersion: 192,
                            script: decoded[0],
                            controlBlock: decoded[1],
                        },
                    ];
                }

                delete input.finalScriptWitness;

                console.log(input);

                psbt.finalizeTaprootInput(i, undefined, MultiSignTransaction.partialFinalizer);
                finalizedInputs++;
            } catch (e) {
                console.log(`error`, e);
            }
        }

        console.log(`Finalized ${finalizedInputs} inputs.`);

        return finalizedInputs === psbt.data.inputs.length - startIndex;
    }

    /**
     * Finalize the psbt multisig transaction
     */
    public finalizeTransactionInputs(): boolean {
        let finalized: boolean = false;
        try {
            for (let i = this.originalInputCount; i < this.transaction.data.inputs.length; i++) {
                this.transaction.finalizeInput(i, this.customFinalizer.bind(this));
            }

            finalized = true;
        } catch (e) {
            console.log(e);
            this.error(`Error finalizing transaction inputs: ${(e as Error).stack}`);
        }

        return finalized;
    }

    public signWithSigner(signer: Signer): boolean {
        let signed: boolean = true;

        for (let i = 1; i < this.transaction.data.inputs.length; i++) {
            let input: PsbtInput = this.transaction.data.inputs[i];

            this.signInput(this.transaction, input, i, signer);
        }

        return signed;
    }

    /**
     * @description Signs the transaction
     * @public
     * @returns {Transaction} - The signed transaction in hex format
     * @throws {Error} - If something went wrong
     */
    public signPSBT(): Psbt {
        if (this.signTransaction()) {
            return this.transaction;
        }

        throw new Error('Could not sign transaction');
    }

    /**
     * Build the transaction
     * @protected
     *
     * @throws {Error} If the left over funds script redeem is required
     * @throws {Error} If the left over funds script redeem version is required
     * @throws {Error} If the left over funds script redeem output is required
     */
    protected override buildTransaction(): void {
        const selectedRedeem = this.targetScriptRedeem;
        if (!selectedRedeem) {
            throw new Error('Left over funds script redeem is required');
        }

        if (!selectedRedeem.redeemVersion) {
            throw new Error('Left over funds script redeem version is required');
        }

        if (!selectedRedeem.output) {
            throw new Error('Left over funds script redeem output is required');
        }

        this.tapLeafScript = {
            leafVersion: selectedRedeem.redeemVersion,
            script: selectedRedeem.output,
            controlBlock: this.getWitness(),
        };

        this.addInputsFromUTXO();

        const outputLeftAmount = this.calculateOutputLeftAmountFromVaults(this.utxos);
        if (outputLeftAmount < 0) {
            throw new Error(`Output value left is negative ${outputLeftAmount}.`);
        }

        this.addOutput({
            address: this.refundVault,
            value: Number(outputLeftAmount),
        });

        this.addOutput({
            address: this.receiver,
            value: Number(this.requestedAmount - 10000n),
        });

        //const amountSpent: bigint = this.getTransactionOPNetFee();
        /*
        this.addOutput({
            value: Number(amountSpent),
            address: this.to,
        });*/

        //this.addRefundOutput(amountSpent);
    }

    /**
     * Builds the transaction.
     * @param {Psbt} transaction - The transaction to build
     * @protected
     * @returns {boolean}
     * @throws {Error} - If something went wrong while building the transaction
     */
    protected override internalBuildTransaction(transaction: Psbt): boolean {
        const inputs: PsbtInputExtended[] = this.getInputs();
        const outputs: PsbtOutputExtended[] = this.getOutputs();

        transaction.setMaximumFeeRate(this._maximumFeeRate);
        transaction.addInputs(inputs);

        for (let i = 0; i < this.updateInputs.length; i++) {
            transaction.updateInput(i, this.updateInputs[i]);
        }

        transaction.addOutputs(outputs);

        try {
            this.signInputs(transaction);

            return this.finalizeTransactionInputs();
        } catch (e) {
            const err: Error = e as Error;

            this.error(
                `[internalBuildTransaction] Something went wrong while getting building the transaction: ${err.stack}`,
            );
        }

        return false;
    }

    /**
     * Sign the inputs
     * @protected
     */
    protected override signInputs(_transaction: Psbt): void {}

    protected override generateScriptAddress(): Payment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
            //pubkeys: this.publicKeys,
        };
    }

    protected override generateTapData(): Payment {
        const selectedRedeem = this.targetScriptRedeem;

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
        };
    }

    /**
     * Generate the script solution
     * @param {PsbtInput} input The input
     * @protected
     *
     * @returns {Buffer[]} The script solution
     */
    protected getScriptSolution(input: PsbtInput): Buffer[] {
        if (!input.tapScriptSig) {
            return [];
        }

        return input.tapScriptSig.map((sig) => {
            return sig.signature;
        });
    }

    /**
     * Get the script tree
     * @private
     *
     * @returns {Taptree} The script tree
     */
    protected getScriptTree(): Taptree {
        this.generateRedeemScripts();

        return [
            {
                output: this.compiledTargetScript,
                version: 192,
            },
            {
                output: MultiSignTransaction.LOCK_LEAF_SCRIPT,
                version: 192,
            },
        ];
    }

    private getTotalOutputAmount(utxos: UTXO[]): bigint {
        let total = BigInt(0);
        for (const utxo of utxos) {
            total += BigInt(utxo.value);
        }

        return total;
    }

    /**
     * @description Calculate the amount left to refund to the first vault.
     * @private
     * @returns {bigint} The amount left
     */
    private calculateOutputLeftAmountFromVaults(utxos: UTXO[]): bigint {
        const total = this.getTotalOutputAmount(utxos);

        return total - this.requestedAmount;
    }

    /**
     * Transaction finalizer
     * @param {number} _inputIndex The input index
     * @param {PsbtInput} input The input
     */
    private customFinalizer = (_inputIndex: number, input: PsbtInput) => {
        if (!this.tapLeafScript) {
            throw new Error('Tap leaf script is required');
        }

        const scriptSolution = this.getScriptSolution(input);
        const witness = scriptSolution
            .concat(this.tapLeafScript.script)
            .concat(this.tapLeafScript.controlBlock);

        return {
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witness),
        };
    };

    /**
     * Generate the redeem scripts
     * @private
     *
     * @throws {Error} If the public keys are required
     * @throws {Error} If the leaf script is required
     * @throws {Error} If the leaf script version is required
     * @throws {Error} If the leaf script output is required
     * @throws {Error} If the target script redeem is required
     */
    private generateRedeemScripts(): void {
        this.targetScriptRedeem = {
            output: this.compiledTargetScript,
            redeemVersion: 192,
        };

        this.leftOverFundsScriptRedeem = {
            output: MultiSignTransaction.LOCK_LEAF_SCRIPT,
            redeemVersion: 192,
        };
    }
}
