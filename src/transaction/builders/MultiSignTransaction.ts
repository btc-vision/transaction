import { PsbtInput, TapScriptSig } from 'bip174/src/lib/interfaces.js';
import { crypto as bitcoinCrypto, opcodes, Payment, Psbt, script, Signer } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TransactionType } from '../enums/TransactionType.js';
import { ITransactionParameters } from '../interfaces/ITransactionParameters.js';
import { MultiSignGenerator } from '../../generators/builders/MultiSignGenerator.js';
import { PsbtInputExtended, PsbtOutputExtended } from '../interfaces/Tap.js';
import { Address } from '@btc-vision/bsi-binary';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { ECPairInterface } from 'ecpair';

export interface MultiSignParameters
    extends Omit<ITransactionParameters, 'priorityFee' | 'signer'> {
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
        //Transaction.SIGHASH_ALL,
        //Transaction.SIGHASH_ANYONECANPAY,
    ];
    public static readonly numsPoint = Buffer.from(
        '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
        'hex',
    );

    public type: TransactionType.MULTI_SIG = TransactionType.MULTI_SIG;

    protected targetScriptRedeem: Payment | null = null;
    protected leftOverFundsScriptRedeem: Payment | null = null;

    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;

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

        super({
            ...parameters,
            signer: EcKeyPair.fromPrivateKey(
                bitcoinCrypto.sha256(Buffer.from('aaaaaaaa', 'utf-8')),
            ),
            priorityFee: 0n,
        });

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

        this.compiledTargetScript = MultiSignGenerator.compile(
            parameters.pubkeys,
            this.minimumSignatures,
        );

        this.scriptTree = this.getScriptTree();
        this.internalInit();
    }

    /**
     * Generate a multisig transaction from a base64 psbt.
     * @param {MultiSignFromBase64Params} params The parameters
     * @returns {MultiSignTransaction} The multisig transaction
     */
    public static fromBase64(params: MultiSignFromBase64Params): MultiSignTransaction {
        const psbt = Psbt.fromBase64(params.psbt, { network: params.network });
        return new MultiSignTransaction({
            ...params,
            psbt,
        });
    }

    /**
     * Verify if that public key already signed the transaction
     * @param {Psbt} psbt The psbt
     * @param {Buffer} signerPubKey The signer public key
     * @returns {boolean} True if the public key signed the transaction
     */
    public static verifyIfSigned(psbt: Psbt, signerPubKey: Buffer): boolean {
        let alreadySigned: boolean = false;
        for (let i = 1; i < psbt.data.inputs.length; i++) {
            const input: PsbtInput = psbt.data.inputs[i];
            if (!input.finalScriptWitness) {
                continue;
            }

            const decoded = TransactionBuilder.readScriptWitnessToWitnessStack(
                input.finalScriptWitness,
            );

            if (decoded.length < 3) {
                continue;
            }

            for (let j = 0; j < decoded.length - 2; j += 3) {
                const pubKey = decoded[j + 2];

                if (pubKey.equals(signerPubKey)) {
                    alreadySigned = true;
                    break;
                }
            }
        }

        return alreadySigned;
    }

    /**
     * Partially sign the transaction
     * @returns {boolean} True if the transaction was signed
     * @public
     */
    public static signPartial(
        psbt: Psbt,
        signer: Signer | ECPairInterface,
        originalInputCount: number,
        minimums: number[],
    ): {
        final: boolean;
        signed: boolean;
    } {
        let signed: boolean = false;
        let final: boolean = true;

        for (let i = originalInputCount; i < psbt.data.inputs.length; i++) {
            const input: PsbtInput = psbt.data.inputs[i];
            if (!input.tapInternalKey) {
                input.tapInternalKey = toXOnly(MultiSignTransaction.numsPoint);
            }

            const partialSignatures: TapScriptSig[] = [];
            if (input.finalScriptWitness) {
                const decoded = TransactionBuilder.readScriptWitnessToWitnessStack(
                    input.finalScriptWitness,
                );

                input.tapLeafScript = [
                    {
                        leafVersion: 192,
                        script: decoded[decoded.length - 2],
                        controlBlock: decoded[decoded.length - 1],
                    },
                ];

                // we must insert all the partial signatures, decoded.length - 2
                for (let j = 0; j < decoded.length - 2; j += 3) {
                    partialSignatures.push({
                        signature: decoded[j],
                        leafHash: decoded[j + 1],
                        pubkey: decoded[j + 2],
                    });
                }

                input.tapScriptSig = (input.tapScriptSig || []).concat(partialSignatures);
            }

            delete input.finalScriptWitness;

            const signHashTypes: number[] = MultiSignTransaction.signHashTypesArray
                ? [MultiSignTransaction.calculateSignHash(MultiSignTransaction.signHashTypesArray)]
                : [];

            try {
                MultiSignTransaction.signInput(psbt, input, i, signer, signHashTypes);

                signed = true;
            } catch (e) {
                console.log(e);
            }

            if (signed) {
                if (!input.tapScriptSig) throw new Error('No new signatures for input');
                if (input.tapScriptSig.length !== minimums[i - originalInputCount]) {
                    final = false;
                }
            }
        }

        return {
            signed,
            final: !signed ? false : final,
        };
    }

    /**
     * Partially finalize a P2TR MS transaction
     * @param {number} inputIndex The input index
     * @param {PsbtInput} input The input
     * @param {Buffer[]} partialSignatures The partial signatures
     * @param {Buffer[]} orderedPubKeys The ordered public keys
     * @param {boolean} isFinal If the transaction is final
     */
    public static partialFinalizer = (
        inputIndex: number,
        input: PsbtInput,
        partialSignatures: Buffer[],
        orderedPubKeys: Buffer[],
        isFinal: boolean,
    ) => {
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

        let scriptSolution: Buffer[] = [];
        if (!isFinal) {
            scriptSolution = input.tapScriptSig
                .map((sig) => {
                    return [sig.signature, sig.leafHash, sig.pubkey];
                })
                .flat();
        } else {
            /** We must order the signatures and the pub keys. */
            for (const pubKey of orderedPubKeys) {
                let found = false;
                for (const sig of input.tapScriptSig) {
                    if (sig.pubkey.equals(toXOnly(pubKey))) {
                        scriptSolution.push(sig.signature);
                        found = true;
                    }
                }

                if (!found) {
                    scriptSolution.push(Buffer.alloc(0));
                }
            }

            scriptSolution = scriptSolution.reverse();
        }

        if (partialSignatures.length > 0) {
            scriptSolution = scriptSolution.concat(partialSignatures);
        }

        const witness = scriptSolution
            .concat(input.tapLeafScript[0].script)
            .concat(input.tapLeafScript[0].controlBlock);

        return {
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witness),
        };
    };

    /**
     * Dedupe signatures
     * @param {TapScriptSig[]} original The original signatures
     * @param {TapScriptSig[]} partial The partial signatures
     * @returns {TapScriptSig[]} The deduped signatures
     */
    public static dedupeSignatures(
        original: TapScriptSig[],
        partial: TapScriptSig[],
    ): TapScriptSig[] {
        const signatures = new Map<string, TapScriptSig>();
        for (const sig of original) {
            signatures.set(sig.pubkey.toString('hex'), sig);
        }

        for (const sig of partial) {
            if (!signatures.has(sig.pubkey.toString('hex'))) {
                signatures.set(sig.pubkey.toString('hex'), sig);
            }
        }

        return Array.from(signatures.values());
    }

    /**
     * Attempt to finalize the inputs
     * @param {Psbt} psbt The psbt
     * @param {number} startIndex The start index
     * @param {Buffer[]} orderedPubKeys The ordered public keys
     * @param {boolean} isFinal If the transaction is final
     * @returns {boolean} True if the inputs were finalized
     */
    public static attemptFinalizeInputs(
        psbt: Psbt,
        startIndex: number,
        orderedPubKeys: Buffer[][],
        isFinal: boolean,
    ): boolean {
        let finalizedInputs = 0;
        for (let i = startIndex; i < psbt.data.inputs.length; i++) {
            try {
                const input = psbt.data.inputs[i];

                if (!input.tapInternalKey) {
                    input.tapInternalKey = toXOnly(MultiSignTransaction.numsPoint);
                }

                const partialSignatures: TapScriptSig[] = [];
                if (input.finalScriptWitness) {
                    const decoded = TransactionBuilder.readScriptWitnessToWitnessStack(
                        input.finalScriptWitness,
                    );

                    // we must insert all the partial signatures, decoded.length - 2
                    for (let j = 0; j < decoded.length - 2; j += 3) {
                        partialSignatures.push({
                            signature: decoded[j],
                            leafHash: decoded[j + 1],
                            pubkey: decoded[j + 2],
                        });
                    }

                    input.tapLeafScript = [
                        {
                            leafVersion: 192,
                            script: decoded[decoded.length - 2],
                            controlBlock: decoded[decoded.length - 1],
                        },
                    ];

                    input.tapScriptSig = MultiSignTransaction.dedupeSignatures(
                        input.tapScriptSig || [],
                        partialSignatures,
                    );
                }

                delete input.finalScriptWitness;

                psbt.finalizeInput(
                    i,
                    (
                        inputIndex: number,
                        input: PsbtInput,
                    ): {
                        finalScriptWitness: Buffer | undefined;
                    } => {
                        return MultiSignTransaction.partialFinalizer(
                            inputIndex,
                            input,
                            [],
                            orderedPubKeys[i - startIndex],
                            isFinal,
                        );
                    },
                );

                finalizedInputs++;
            } catch (e) {}
        }

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
            this.error(`Error finalizing transaction inputs: ${(e as Error).stack}`);
        }

        return finalized;
    }

    /**
     * @description Signs the transaction
     * @public
     * @returns {Promise<Psbt>} - The signed transaction in hex format
     * @throws {Error} - If something went wrong
     */
    public async signPSBT(): Promise<Psbt> {
        if (await this.signTransaction()) {
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
    // eslint-disable-next-line @typescript-eslint/require-await
    protected override async buildTransaction(): Promise<void> {
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
            value: Number(this.requestedAmount),
        });
    }

    /**
     * Builds the transaction.
     * @param {Psbt} transaction - The transaction to build
     * @param checkPartialSigs
     * @protected
     * @returns {Promise<boolean>}
     * @throws {Error} - If something went wrong while building the transaction
     */
    protected override async internalBuildTransaction(
        transaction: Psbt,
        checkPartialSigs: boolean = false,
    ): Promise<boolean> {
        const inputs: PsbtInputExtended[] = this.getInputs();
        const outputs: PsbtOutputExtended[] = this.getOutputs();

        transaction.setMaximumFeeRate(this._maximumFeeRate);
        transaction.addInputs(inputs, checkPartialSigs);

        for (let i = 0; i < this.updateInputs.length; i++) {
            transaction.updateInput(i, this.updateInputs[i]);
        }

        transaction.addOutputs(outputs);

        try {
            await this.signInputs(transaction);

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
    protected override async signInputs(_transaction: Psbt): Promise<void> {}

    protected override generateScriptAddress(): Payment {
        return {
            internalPubkey: toXOnly(MultiSignTransaction.numsPoint), //this.internalPubKeyToXOnly(),
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
            internalPubkey: toXOnly(MultiSignTransaction.numsPoint), //this.internalPubKeyToXOnly(),
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
