import type { Script } from '@btc-vision/bitcoin';
import bitcoin, {
    equals,
    fromHex,
    getFinalScripts,
    type Network,
    opcodes,
    Psbt,
    type PsbtInputExtended,
    type PsbtOutputExtended,
    script,
    type Signer,
    toSatoshi,
    toXOnly,
    Transaction,
} from '@btc-vision/bitcoin';
import { witnessStackToScriptWitness } from '../utils/WitnessUtils.js';
import type { UpdateInput } from '../interfaces/Tap.js';
import { TransactionType } from '../enums/TransactionType.js';
import type {
    IFundingTransactionParameters,
    ITransactionParameters,
} from '../interfaces/ITransactionParameters.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import type { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { type UniversalSigner } from '@btc-vision/ecpair';
import { AddressVerificator } from '../../keypair/AddressVerificator.js';
import { TweakedTransaction } from '../shared/TweakedTransaction.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';
import type { IP2WSHAddress } from '../mineable/IP2WSHAddress.js';
import { P2WDADetector } from '../../p2wda/P2WDADetector.js';
import { type Feature, FeaturePriority, Features, type MLDSALinkRequest } from '../../generators/Features.js';
import { BITCOIN_PROTOCOL_ID, getChainId } from '../../chain/ChainData.js';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';
import { MLDSASecurityLevel } from '@btc-vision/bip32';
import { MessageSigner } from '../../keypair/MessageSigner.js';
import { getLevelFromPublicKeyLength } from '../../generators/MLDSAData.js';

export const MINIMUM_AMOUNT_REWARD: bigint = 330n; //540n;
export const MINIMUM_AMOUNT_CA: bigint = 297n;
export const ANCHOR_SCRIPT = fromHex('51024e73');

/**
 * Allows to build a transaction like you would on Ethereum.
 * @description The transaction builder class
 * @abstract
 * @class TransactionBuilder
 */
export abstract class TransactionBuilder<T extends TransactionType> extends TweakedTransaction {
    public static readonly MINIMUM_DUST: bigint = 330n;

    public abstract readonly type: T;
    public override readonly logColor: string = '#785def';
    public debugFees: boolean = false;

    // Cancel script
    public LOCK_LEAF_SCRIPT: Script;

    /**
     * @description The overflow fees of the transaction
     * @public
     */
    public overflowFees: bigint = 0n;

    /**
     * @description Cost in satoshis of the transaction fee
     */
    public transactionFee: bigint = 0n;

    /**
     * @description The estimated fees of the transaction
     */
    public estimatedFees: bigint = 0n;

    /**
     * @param {ITransactionParameters} parameters - The transaction parameters
     */
    public optionalOutputs: PsbtOutputExtended[] | undefined;

    /**
     * @description The transaction itself.
     */
    protected transaction: Psbt;

    /**
     * @description Inputs to update later on.
     */
    protected readonly updateInputs: UpdateInput[] = [];

    /**
     * @description The outputs of the transaction
     */
    protected readonly outputs: PsbtOutputExtended[] = [];

    /**
     * @description Output that will be used to pay the fees
     */
    protected feeOutput: PsbtOutputExtended | null = null;

    /**
     * @description The total amount of satoshis in the inputs
     */
    protected totalInputAmount: bigint;

    /**
     * @description The signer of the transaction
     */
    protected override readonly signer: Signer | UniversalSigner | UnisatSigner;

    /**
     * @description The network where the transaction will be broadcasted
     */
    protected override readonly network: Network;

    /**
     * @description The fee rate of the transaction
     */
    protected readonly feeRate: number;

    /**
     * @description The opnet priority fee of the transaction
     */
    protected priorityFee: bigint;
    protected gasSatFee: bigint;

    /**
     * @description The utxos used in the transaction
     */
    protected utxos: UTXO[];

    /**
     * @description The inputs of the transaction
     * @protected
     */
    protected optionalInputs: UTXO[];

    /**
     * @description The address where the transaction is sent to
     * @protected
     */
    protected to: string | undefined;

    /**
     * @description The address where the transaction is sent from
     * @protected
     */
    protected from: string;

    /**
     * @description The maximum fee rate of the transaction
     */
    protected _maximumFeeRate: number = 100000000;

    /**
     * @description Is the destionation P2PK
     * @protected
     */
    protected isPubKeyDestination: boolean;

    /**
     * @description If the transaction need an anchor output
     * @protected
     */
    protected anchor: boolean;

    protected note?: Uint8Array;

    private optionalOutputsAdded: boolean = false;

    protected constructor(parameters: ITransactionParameters) {
        super(parameters);

        if (parameters.estimatedFees) {
            this.estimatedFees = parameters.estimatedFees;
        }

        this.signer = parameters.signer;
        this.network = parameters.network;
        this.feeRate = parameters.feeRate;
        this.priorityFee = parameters.priorityFee ?? 0n;
        this.gasSatFee = parameters.gasSatFee ?? 0n;
        this.utxos = parameters.utxos;
        this.optionalInputs = parameters.optionalInputs || [];
        this.to = parameters.to || undefined;
        this.debugFees = parameters.debugFees || false;

        this.LOCK_LEAF_SCRIPT = this.defineLockScript();

        if (parameters.note) {
            if (typeof parameters.note === 'string') {
                this.note = new TextEncoder().encode(parameters.note);
            } else {
                this.note = parameters.note;
            }
        }

        this.anchor = parameters.anchor ?? false;

        this.isPubKeyDestination = this.to
            ? AddressVerificator.isValidPublicKey(this.to, this.network)
            : false;

        this.optionalOutputs = parameters.optionalOutputs;

        this.from = TransactionBuilder.getFrom(parameters.from, this.signer, this.network);

        this.totalInputAmount = this.calculateTotalUTXOAmount();

        const totalVOut: bigint = this.calculateTotalVOutAmount();
        if (totalVOut < this.totalInputAmount) {
            throw new Error(`Vout value is less than the value to send`);
        }

        this.transaction = new Psbt({
            network: this.network,
            version: this.txVersion,
        });
    }

    public override [Symbol.dispose](): void {
        super[Symbol.dispose]();

        this.updateInputs.length = 0;
        this.outputs.length = 0;
        this.feeOutput = null;
        this.optionalOutputs = undefined;
        this.utxos = [];
        this.optionalInputs = [];
    }

    public static getFrom(
        from: string | undefined,
        keypair: UniversalSigner | Signer,
        network: Network,
    ): string {
        return from || EcKeyPair.getTaprootAddress(keypair, network);
    }

    /**
     * @description Converts the witness stack to a script witness
     * @param {Buffer[]} witness - The witness stack
     * @protected
     * @returns {Buffer}
     */
    public static witnessStackToScriptWitness(witness: Uint8Array[]): Uint8Array {
        return witnessStackToScriptWitness(witness);
    }

    public addOPReturn(buffer: Uint8Array): void {
        const compileScript = script.compile([opcodes.OP_RETURN, buffer]);

        this.addOutput({
            value: toSatoshi(0n),
            script: compileScript,
        });
    }

    public addAnchor(): void {
        this.addOutput({
            value: toSatoshi(0n),
            script: ANCHOR_SCRIPT as Script,
        });
    }

    public async getFundingTransactionParameters(): Promise<IFundingTransactionParameters> {
        if (!this.estimatedFees) {
            this.estimatedFees = await this.estimateTransactionFees();
        }

        return {
            utxos: this.utxos,
            to: this.getScriptAddress(),
            signer: this.signer,
            network: this.network,
            feeRate: this.feeRate,
            priorityFee: this.priorityFee ?? 0n,
            gasSatFee: this.gasSatFee ?? 0n,
            from: this.from,
            amount: this.estimatedFees,
            optionalInputs: this.optionalInputs,
            mldsaSigner: null,
            ...(this.optionalOutputs !== undefined ? { optionalOutputs: this.optionalOutputs } : {}),
        } satisfies IFundingTransactionParameters;
    }

    /**
     * Set the destination address of the transaction
     * @param {string} address - The address to set
     */
    public setDestinationAddress(address: string): void {
        this.to = address; // this.getScriptAddress()
    }

    /**
     * Set the maximum fee rate of the transaction in satoshis per byte
     * @param {number} feeRate - The fee rate to set
     * @public
     */
    public setMaximumFeeRate(feeRate: number): void {
        this._maximumFeeRate = feeRate;
    }

    /**
     * @description Signs the transaction
     * @public
     * @returns {Promise<Transaction>} - The signed transaction in hex format
     * @throws {Error} - If something went wrong
     */
    public async signTransaction(): Promise<Transaction> {
        if (!this.utxos.length) {
            throw new Error('No UTXOs specified');
        }

        if (
            this.to &&
            !this.isPubKeyDestination &&
            !EcKeyPair.verifyContractAddress(this.to, this.network)
        ) {
            throw new Error(
                'Invalid contract address. The contract address must be a taproot address.',
            );
        }

        if (this.signed) throw new Error('Transaction is already signed');
        this.signed = true;

        await this.buildTransaction();

        const builtTx = await this.internalBuildTransaction(this.transaction);
        if (builtTx) {
            if (this.regenerated) {
                throw new Error('Transaction was regenerated');
            }

            return this.transaction.extractTransaction(true, true);
        }

        throw new Error('Could not sign transaction');
    }

    /**
     * @description Generates the transaction minimal signatures
     * @public
     */
    public async generateTransactionMinimalSignatures(
        checkPartialSigs: boolean = false,
    ): Promise<void> {
        if (
            this.to &&
            !this.isPubKeyDestination &&
            !EcKeyPair.verifyContractAddress(this.to, this.network)
        ) {
            throw new Error(
                'Invalid contract address. The contract address must be a taproot address.',
            );
        }

        await this.buildTransaction();

        if (this.transaction.data.inputs.length === 0) {
            const inputs: PsbtInputExtended[] = this.getInputs();
            const outputs: PsbtOutputExtended[] = this.getOutputs();

            this.transaction.setMaximumFeeRate(this._maximumFeeRate);
            this.transaction.addInputs(inputs, checkPartialSigs);

            for (let i = 0; i < this.updateInputs.length; i++) {
                this.transaction.updateInput(i, this.updateInputs[i] as UpdateInput);
            }

            this.transaction.addOutputs(outputs);
        }
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
     * Add an input to the transaction.
     * @param {PsbtInputExtended} input - The input to add
     * @public
     * @returns {void}
     */
    public addInput(input: PsbtInputExtended): void {
        this.inputs.push(input);
    }

    /**
     * Add an output to the transaction.
     * @param {PsbtOutputExtended} output - The output to add
     * @param bypassMinCheck
     * @public
     * @returns {void}
     */
    public addOutput(output: PsbtOutputExtended, bypassMinCheck: boolean = false): void {
        if (output.value === toSatoshi(0n)) {
            const scriptOutput = output as {
                script: Uint8Array;
            };

            if (!scriptOutput.script || scriptOutput.script.length === 0) {
                throw new Error('Output value is 0 and no script provided');
            }

            if (scriptOutput.script.length < 2) {
                throw new Error('Output script is too short');
            }

            if (
                scriptOutput.script[0] !== opcodes.OP_RETURN &&
                !equals(scriptOutput.script, ANCHOR_SCRIPT)
            ) {
                throw new Error(
                    'Output script must start with OP_RETURN or be an ANCHOR when value is 0',
                );
            }
        } else if (!bypassMinCheck && BigInt(output.value) < TransactionBuilder.MINIMUM_DUST) {
            throw new Error(
                `Output value is less than the minimum dust ${output.value} < ${TransactionBuilder.MINIMUM_DUST}`,
            );
        }

        this.outputs.push(output);
    }

    /**
     * Returns the total value of all outputs added so far (excluding the fee/change output).
     * @public
     * @returns {bigint}
     */
    public getTotalOutputValue(): bigint {
        return this.outputs.reduce((total, output) => total + BigInt(output.value), 0n);
    }

    /**
     * Receiver address.
     * @public
     * @returns {string} - The receiver address
     */
    public toAddress(): string | undefined {
        return this.to;
    }

    /**
     * @description Returns the script address
     * @returns {string} - The script address
     */
    public address(): string | undefined {
        return this.tapData?.address;
    }

    /**
     * Estimates the transaction fees with accurate size calculation.
     * @public
     * @returns {Promise<bigint>}
     */
    public async estimateTransactionFees(): Promise<bigint> {
        await Promise.resolve();

        const fakeTx = new Psbt({ network: this.network });
        const inputs = this.getInputs();
        const outputs = this.getOutputs();
        fakeTx.addInputs(inputs);
        fakeTx.addOutputs(outputs);

        const dummySchnorrSig = new Uint8Array(64);
        const dummyEcdsaSig = new Uint8Array(72);
        const dummyCompressedPubkey = new Uint8Array(33).fill(2);

        const finalizer = (inputIndex: number, input: PsbtInputExtended) => {
            if (input.isPayToAnchor || this.anchorInputIndices.has(inputIndex)) {
                return {
                    finalScriptSig: undefined,
                    finalScriptWitness: Uint8Array.from([0]),
                };
            }

            if (input.witnessScript && P2WDADetector.isP2WDAWitnessScript(input.witnessScript)) {
                // Create dummy witness stack for P2WDA
                const dummyDataSlots: Uint8Array[] = [];
                for (let i = 0; i < 10; i++) {
                    dummyDataSlots.push(new Uint8Array(0));
                }

                const dummyEcdsaSig = new Uint8Array(72);
                return {
                    finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                        ...dummyDataSlots,
                        dummyEcdsaSig,
                        input.witnessScript,
                    ]),
                };
            }

            if (inputIndex === 0 && this.tapLeafScript) {
                const dummySecret = new Uint8Array(32);
                const dummyScript = this.tapLeafScript.script;

                // A control block for a 2-leaf tree contains one 32-byte hash.
                const dummyControlBlock = new Uint8Array(1 + 32 + 32);

                return {
                    finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                        dummySecret,
                        dummySchnorrSig, // It's a tapScriptSig, which is Schnorr
                        dummySchnorrSig, // Second Schnorr signature
                        dummyScript,
                        dummyControlBlock,
                    ]),
                };
            }

            if (input.witnessUtxo) {
                const script = input.witnessUtxo.script;
                const decompiled = bitcoin.script.decompile(script);
                if (
                    decompiled &&
                    decompiled.length === 5 &&
                    decompiled[0] === opcodes.OP_DUP &&
                    decompiled[1] === opcodes.OP_HASH160 &&
                    decompiled[3] === opcodes.OP_EQUALVERIFY &&
                    decompiled[4] === opcodes.OP_CHECKSIG
                ) {
                    return {
                        finalScriptSig: bitcoin.script.compile([
                            dummyEcdsaSig,
                            dummyCompressedPubkey,
                        ]),
                        finalScriptWitness: undefined,
                    };
                }
            }

            if (input.witnessScript) {
                if (this.csvInputIndices.has(inputIndex)) {
                    // CSV P2WSH needs: [signature, witnessScript]
                    return {
                        finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                            dummyEcdsaSig,
                            input.witnessScript,
                        ]),
                    };
                }

                if (input.redeemScript) {
                    // P2SH-P2WSH needs redeemScript in scriptSig and witness data
                    const dummyWitness = [dummyEcdsaSig, input.witnessScript];
                    return {
                        finalScriptSig: input.redeemScript,
                        finalScriptWitness:
                            TransactionBuilder.witnessStackToScriptWitness(dummyWitness),
                    };
                }

                const decompiled = bitcoin.script.decompile(input.witnessScript);
                if (decompiled && decompiled.length >= 4) {
                    const firstOp = decompiled[0];
                    const lastOp = decompiled[decompiled.length - 1];
                    // Check if it's M-of-N multisig
                    if (
                        typeof firstOp === 'number' &&
                        firstOp >= opcodes.OP_1 &&
                        lastOp === opcodes.OP_CHECKMULTISIG
                    ) {
                        const m = firstOp - opcodes.OP_1 + 1;
                        const signatures: Uint8Array[] = [];
                        for (let i = 0; i < m; i++) {
                            signatures.push(dummyEcdsaSig);
                        }

                        return {
                            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                                new Uint8Array(0), // OP_0 due to multisig bug
                                ...signatures,
                                input.witnessScript,
                            ]),
                        };
                    }
                }

                return {
                    finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                        dummyEcdsaSig,
                        input.witnessScript,
                    ]),
                };
            } else if (input.redeemScript) {
                const decompiled = bitcoin.script.decompile(input.redeemScript);
                if (
                    decompiled &&
                    decompiled.length === 2 &&
                    decompiled[0] === opcodes.OP_0 &&
                    decompiled[1] instanceof Uint8Array &&
                    decompiled[1].length === 20
                ) {
                    // P2SH-P2WPKH
                    return {
                        finalScriptSig: input.redeemScript,
                        finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                            dummyEcdsaSig,
                            dummyCompressedPubkey,
                        ]),
                    };
                }
            }

            if (input.redeemScript && !input.witnessScript && !input.witnessUtxo) {
                // Pure P2SH needs signatures + redeemScript in scriptSig
                return {
                    finalScriptSig: bitcoin.script.compile([dummyEcdsaSig, input.redeemScript]),
                    finalScriptWitness: undefined,
                };
            }

            const inputScript = input.witnessUtxo?.script;
            if (!inputScript) return { finalScriptSig: undefined, finalScriptWitness: undefined };

            if (input.tapInternalKey) {
                return {
                    finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                        dummySchnorrSig,
                    ]),
                };
            }

            if (inputScript.length === 22 && inputScript[0] === opcodes.OP_0) {
                return {
                    finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                        dummyEcdsaSig,
                        dummyCompressedPubkey,
                    ]),
                };
            }

            if (input.redeemScript?.length === 22 && input.redeemScript[0] === opcodes.OP_0) {
                return {
                    finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness([
                        dummyEcdsaSig,
                        dummyCompressedPubkey,
                    ]),
                };
            }

            return getFinalScripts(
                inputIndex,
                input,
                inputScript as Script,
                true,
                !!input.redeemScript,
                !!input.witnessScript,
            );
        };

        try {
            for (let i = 0; i < fakeTx.data.inputs.length; i++) {
                const fullInput = inputs[i];
                if (fullInput) {
                    fakeTx.finalizeInput(i, (idx: number) => finalizer(idx, fullInput));
                }
            }
        } catch (e) {
            this.warn(`Could not finalize dummy tx: ${(e as Error).message}`);
        }

        const tx = fakeTx.extractTransaction(true, true);
        const size = tx.virtualSize();
        const fee = this.feeRate * size;
        const finalFee = BigInt(Math.ceil(fee));

        if (this.debugFees) {
            this.log(
                `Estimating fees: feeRate=${this.feeRate}, accurate_vSize=${size}, fee=${finalFee}n`,
            );
        }
        return finalFee;
    }

    public async rebuildFromBase64(base64: string): Promise<Psbt> {
        this.transaction = Psbt.fromBase64(base64, {
            network: this.network,
            version: this.txVersion,
        });

        this.signed = false;

        this.sighashTypes = [Transaction.SIGHASH_ANYONECANPAY, Transaction.SIGHASH_ALL];

        return await this.signPSBT();
    }

    public setPSBT(psbt: Psbt): void {
        this.transaction = psbt;
    }

    /**
     * Returns the inputs of the transaction.
     * @protected
     * @returns {PsbtInputExtended[]}
     */
    public getInputs(): PsbtInputExtended[] {
        return this.inputs;
    }

    /**
     * Returns the outputs of the transaction.
     * @protected
     * @returns {PsbtOutputExtended[]}
     */
    public getOutputs(): PsbtOutputExtended[] {
        const outputs: PsbtOutputExtended[] = [...this.outputs];
        if (this.feeOutput) outputs.push(this.feeOutput);

        return outputs;
    }

    public getOptionalOutputValue(): bigint {
        if (!this.optionalOutputs) return 0n;

        let total = 0n;
        for (let i = 0; i < this.optionalOutputs.length; i++) {
            total += BigInt((this.optionalOutputs[i] as PsbtOutputExtended).value);
        }

        return total;
    }

    protected async addRefundOutput(
        amountSpent: bigint,
        expectRefund: boolean = false,
    ): Promise<void> {
        if (this.note) {
            this.addOPReturn(this.note);
        }

        if (this.anchor) {
            this.addAnchor();
        }

        // Initialize variables for iteration
        let previousFee = -1n;
        let estimatedFee = 0n;
        let iterations = 0;
        const maxIterations = 5; // Prevent infinite loops

        let sendBackAmount = 0n;
        // Iterate until fee stabilizes
        while (iterations < maxIterations && estimatedFee !== previousFee) {
            previousFee = estimatedFee;

            // Calculate the fee with current outputs
            estimatedFee = await this.estimateTransactionFees();

            // Total amount that needs to be spent (outputs + fee)
            const totalSpent = amountSpent + estimatedFee;

            // Calculate refund
            sendBackAmount = this.totalInputAmount - totalSpent;

            if (this.debugFees) {
                this.log(
                    `Iteration ${iterations + 1}: inputAmount=${this.totalInputAmount}, totalSpent=${totalSpent}, sendBackAmount=${sendBackAmount}`,
                );
            }

            // Determine if we should add a change output
            if (sendBackAmount >= TransactionBuilder.MINIMUM_DUST) {
                // Create the appropriate change output
                if (AddressVerificator.isValidP2TRAddress(this.from, this.network)) {
                    this.feeOutput = {
                        value: toSatoshi(sendBackAmount),
                        address: this.from,
                        tapInternalKey: this.internalPubKeyToXOnly(),
                    };
                } else if (AddressVerificator.isValidPublicKey(this.from, this.network)) {
                    const pubKeyScript = script.compile([
                        fromHex(this.from.replace('0x', '')),
                        opcodes.OP_CHECKSIG,
                    ]);

                    this.feeOutput = {
                        value: toSatoshi(sendBackAmount),
                        script: pubKeyScript,
                    };
                } else {
                    this.feeOutput = {
                        value: toSatoshi(sendBackAmount),
                        address: this.from,
                    };
                }

                // Set overflowFees when we have a change output
                this.overflowFees = sendBackAmount;
            } else {
                // No change output if below dust
                this.feeOutput = null;
                this.overflowFees = 0n;

                if (sendBackAmount < 0n && iterations === maxIterations) {
                    throw new Error(
                        `Insufficient funds: need ${totalSpent} sats but only have ${this.totalInputAmount} sats`,
                    );
                }

                if (this.debugFees) {
                    this.warn(
                        `Amount to send back (${sendBackAmount} sat) is less than minimum dust...`,
                    );
                }
            }

            iterations++;
        }

        if (expectRefund && sendBackAmount < 0n) {
            throw new Error(
                `Insufficient funds: need at least ${-sendBackAmount} more sats to cover fees.`,
            );
        }

        if (iterations >= maxIterations) {
            this.warn(`Fee calculation did not stabilize after ${maxIterations} iterations`);
        }

        // Store the final fee
        this.transactionFee = estimatedFee;

        if (this.debugFees) {
            this.log(
                `Final fee: ${estimatedFee} sats, Change output: ${this.feeOutput ? `${this.feeOutput.value} sats` : 'none'}`,
            );
        }
    }

    protected defineLockScript(): Script {
        return script.compile([toXOnly(this.signer.publicKey), opcodes.OP_CHECKSIG]);
    }

    /**
     * @description Adds the value to the output
     * @param {number | bigint} value - The value to add
     * @protected
     * @returns {void}
     */
    protected addValueToToOutput(value: number | bigint): void {
        if (BigInt(value) < TransactionBuilder.MINIMUM_DUST) {
            throw new Error(
                `Value to send is less than the minimum dust ${value} < ${TransactionBuilder.MINIMUM_DUST}`,
            );
        }

        for (let i = 0; i < this.outputs.length; i++) {
            const output = this.outputs[i] as PsbtOutputExtended;
            if ('address' in output && output.address === this.to) {
                this.outputs[i] = {
                    ...output,
                    value: toSatoshi(BigInt(output.value) + BigInt(value)),
                } as PsbtOutputExtended;
                return;
            }
        }

        throw new Error('Output not found');
    }

    protected generateLegacySignature(): Uint8Array {
        this.tweakSigner();

        if (!this.tweakedSigner) {
            throw new Error('Tweaked signer is not defined');
        }

        const tweakedKey = toXOnly(this.tweakedSigner.publicKey);
        const originalKey = this.signer.publicKey;
        if (originalKey.length !== 33) {
            throw new Error('Original public key must be compressed (33 bytes)');
        }

        const chainId = getChainId(this.network);

        const writer = new BinaryWriter();

        // ONLY SUPPORT MLDSA-44 FOR NOW.
        writer.writeU8(MLDSASecurityLevel.LEVEL2);
        writer.writeBytes(this.hashedPublicKey);
        writer.writeBytes(tweakedKey);
        writer.writeBytes(originalKey);
        writer.writeBytes(BITCOIN_PROTOCOL_ID);
        writer.writeBytes(chainId);

        const message = writer.getBuffer();
        const signature = MessageSigner.signMessage(this.tweakedSigner, message);
        const isValid = MessageSigner.verifySignature(tweakedKey, message, signature.signature);

        if (!isValid) {
            throw new Error('Could not verify generated legacy signature for MLDSA link request');
        }

        return new Uint8Array(signature.signature);
    }

    protected generateMLDSASignature(): Uint8Array {
        if (!this.mldsaSigner) {
            throw new Error('MLDSA signer is not defined');
        }

        this.tweakSigner();

        if (!this.tweakedSigner) {
            throw new Error('Tweaked signer is not defined');
        }

        const tweakedKey = toXOnly(this.tweakedSigner.publicKey);
        const originalKey = this.signer.publicKey;
        if (originalKey.length !== 33) {
            throw new Error('Original public key must be compressed (33 bytes)');
        }

        const chainId = getChainId(this.network);
        const level = getLevelFromPublicKeyLength(this.mldsaSigner.publicKey.length);

        if (level !== MLDSASecurityLevel.LEVEL2) {
            throw new Error('Only MLDSA level 2 is supported for link requests');
        }

        const writer = new BinaryWriter();
        writer.writeU8(level);
        writer.writeBytes(this.hashedPublicKey);
        writer.writeBytes(this.mldsaSigner.publicKey);
        writer.writeBytes(tweakedKey);
        writer.writeBytes(originalKey);
        writer.writeBytes(BITCOIN_PROTOCOL_ID);
        writer.writeBytes(chainId);

        const message = writer.getBuffer();
        const signature = MessageSigner.signMLDSAMessage(this.mldsaSigner, message);

        const isValid = MessageSigner.verifyMLDSASignature(
            this.mldsaSigner,
            message,
            signature.signature,
        );

        if (!isValid) {
            throw new Error('Could not verify generated MLDSA signature for link request');
        }

        return new Uint8Array(signature.signature);
    }

    protected generateMLDSALinkRequest(
        parameters: ITransactionParameters,
        features: Feature<Features>[],
    ): void {
        const mldsaSigner = this.mldsaSigner;
        const legacySignature = this.generateLegacySignature();

        let mldsaSignature: Uint8Array | null = null;
        if (parameters.revealMLDSAPublicKey) {
            mldsaSignature = this.generateMLDSASignature();
        }

        const mldsaRequest: MLDSALinkRequest = {
            priority: FeaturePriority.MLDSA_LINK_PUBKEY,
            opcode: Features.MLDSA_LINK_PUBKEY,
            data: {
                verifyRequest: !!parameters.revealMLDSAPublicKey,
                publicKey: mldsaSigner.publicKey,
                hashedPublicKey: this.hashedPublicKey,
                level: getLevelFromPublicKeyLength(mldsaSigner.publicKey.length),
                legacySignature: legacySignature,
                mldsaSignature: mldsaSignature,
            },
        };

        features.push(mldsaRequest);
    }

    /**
     * @description Returns the transaction opnet fee
     * @protected
     * @returns {bigint}
     */
    protected getTransactionOPNetFee(): bigint {
        const totalFee = this.priorityFee + this.gasSatFee;
        if (totalFee > TransactionBuilder.MINIMUM_DUST) {
            return totalFee;
        }

        return TransactionBuilder.MINIMUM_DUST;
    }

    /**
     * @description Returns the total amount of satoshis in the inputs
     * @protected
     * @returns {bigint}
     */
    protected calculateTotalUTXOAmount(): bigint {
        let total: bigint = 0n;
        for (const utxo of this.utxos) {
            total += utxo.value;
        }

        for (const utxo of this.optionalInputs) {
            total += utxo.value;
        }

        return total;
    }

    /**
     * @description Returns the total amount of satoshis in the outputs
     * @protected
     * @returns {bigint}
     */
    protected calculateTotalVOutAmount(): bigint {
        let total: bigint = 0n;
        for (const utxo of this.utxos) {
            total += utxo.value;
        }

        for (const utxo of this.optionalInputs) {
            total += utxo.value;
        }

        return total;
    }

    /**
     * @description Adds optional outputs to transaction and returns their total value in satoshi to calculate refund transaction
     * @protected
     * @returns {bigint}
     */
    protected addOptionalOutputsAndGetAmount(): bigint {
        if (!this.optionalOutputs || this.optionalOutputsAdded) return 0n;

        let refundedFromOptionalOutputs: bigint = 0n;

        for (let i = 0; i < this.optionalOutputs.length; i++) {
            this.addOutput(this.optionalOutputs[i] as PsbtOutputExtended);
            refundedFromOptionalOutputs += BigInt((this.optionalOutputs[i] as PsbtOutputExtended).value);
        }

        this.optionalOutputsAdded = true;

        return refundedFromOptionalOutputs;
    }

    /**
     * @description Adds the inputs from the utxos
     * @protected
     * @returns {void}
     */
    protected addInputsFromUTXO(): void {
        if (this.utxos.length) {
            //throw new Error('No UTXOs specified');

            if (this.totalInputAmount < TransactionBuilder.MINIMUM_DUST) {
                throw new Error(
                    `Total input amount is ${this.totalInputAmount} sat which is less than the minimum dust ${TransactionBuilder.MINIMUM_DUST} sat.`,
                );
            }

            for (let i = 0; i < this.utxos.length; i++) {
                const utxo = this.utxos[i] as UTXO;

                // Register signer BEFORE generating input (needed for tapInternalKey)
                this.registerInputSigner(i, utxo);

                const input = this.generatePsbtInputExtended(utxo, i);
                this.addInput(input);
            }
        }

        if (this.optionalInputs) {
            for (
                let i = this.utxos.length;
                i < this.optionalInputs.length + this.utxos.length;
                i++
            ) {
                const utxo = this.optionalInputs[i - this.utxos.length] as UTXO;

                // Register signer BEFORE generating input (needed for tapInternalKey)
                this.registerInputSigner(i, utxo);

                const input = this.generatePsbtInputExtended(utxo, i, true);
                this.addInput(input);
            }
        }
    }

    /**
     * Internal init.
     * @protected
     */
    protected override internalInit(): void {
        this.verifyUTXOValidity();

        super.internalInit();
    }

    /**
     * Builds the transaction.
     * @protected
     * @returns {Promise<void>}
     */
    protected abstract buildTransaction(): Promise<void>;

    /**
     * Add an input update
     * @param {UpdateInput} input - The input to update
     * @protected
     * @returns {void}
     */
    protected updateInput(input: UpdateInput): void {
        this.updateInputs.push(input);
    }

    /**
     * Adds the fee to the output.
     * @param amountSpent
     * @param contractAddress
     * @param epochChallenge
     * @param addContractOutput
     * @protected
     */
    protected addFeeToOutput(
        amountSpent: bigint,
        contractAddress: string,
        epochChallenge: IP2WSHAddress,
        addContractOutput: boolean,
    ): void {
        if (addContractOutput) {
            let amountToCA: bigint;
            if (amountSpent > MINIMUM_AMOUNT_REWARD + MINIMUM_AMOUNT_CA) {
                amountToCA = MINIMUM_AMOUNT_CA;
            } else {
                amountToCA = amountSpent;
            }

            // ALWAYS THE FIRST INPUT.
            this.addOutput(
                {
                    value: toSatoshi(amountToCA),
                    address: contractAddress,
                },
                true,
            );

            // ALWAYS SECOND.
            if (
                amountToCA === MINIMUM_AMOUNT_CA &&
                amountSpent - MINIMUM_AMOUNT_CA > MINIMUM_AMOUNT_REWARD
            ) {
                this.addOutput(
                    {
                        value: toSatoshi(amountSpent - amountToCA),
                        address: epochChallenge.address,
                    },
                    true,
                );
            }
        } else {
            // When SEND_AMOUNT_TO_CA is false, always send to epochChallenge
            // Use the maximum of amountSpent or MINIMUM_AMOUNT_REWARD
            const amountToEpoch =
                amountSpent < MINIMUM_AMOUNT_REWARD ? MINIMUM_AMOUNT_REWARD : amountSpent;

            this.addOutput(
                {
                    value: toSatoshi(amountToEpoch),
                    address: epochChallenge.address,
                },
                true,
            );
        }
    }

    /**
     * Returns the witness of the tap transaction.
     * @protected
     * @returns {Buffer}
     */
    protected getWitness(): Uint8Array {
        if (!this.tapData || !this.tapData.witness) {
            throw new Error('Witness is required');
        }

        if (this.tapData.witness.length === 0) {
            throw new Error('Witness is empty');
        }

        return this.tapData.witness[this.tapData.witness.length - 1] as Uint8Array;
    }

    /**
     * Returns the tap output.
     * @protected
     * @returns {Buffer}
     */
    protected getTapOutput(): Uint8Array {
        if (!this.tapData || !this.tapData.output) {
            throw new Error('Tap data is required');
        }

        return this.tapData.output;
    }

    /**
     * Verifies that the utxos are valid.
     * @protected
     */
    protected verifyUTXOValidity(): void {
        for (const utxo of this.utxos) {
            if (!utxo.scriptPubKey) {
                throw new Error('Address is required');
            }
        }

        for (const utxo of this.optionalInputs) {
            if (!utxo.scriptPubKey) {
                throw new Error('Address is required');
            }
        }
    }

    /**
     * Set transaction fee output.
     * @param {PsbtOutputExtended} output - The output to set the fees
     * @protected
     * @returns {Promise<void>}
     */
    protected async setFeeOutput(output: PsbtOutputExtended): Promise<void> {
        const initialValue = output.value;
        this.feeOutput = null; // Start with no fee output

        let estimatedFee = 0n;
        let lastFee = -1n;

        this.log(
            `setFeeOutput: Starting fee calculation for change. Initial available value: ${initialValue} sats.`,
        );

        for (let i = 0; i < 3 && estimatedFee !== lastFee; i++) {
            lastFee = estimatedFee;
            estimatedFee = await this.estimateTransactionFees();
            const valueLeft = BigInt(initialValue) - estimatedFee;

            if (this.debugFees) {
                this.log(
                    ` -> Iteration ${i + 1}: Estimated fee is ${estimatedFee} sats. Value left for change: ${valueLeft} sats.`,
                );
            }

            if (valueLeft >= TransactionBuilder.MINIMUM_DUST) {
                this.feeOutput = { ...output, value: toSatoshi(valueLeft) };
                this.overflowFees = valueLeft;
            } else {
                this.feeOutput = null;
                this.overflowFees = 0n;
                // Re-estimate fee one last time without the change output
                estimatedFee = await this.estimateTransactionFees();

                if (this.debugFees) {
                    this.log(
                        ` -> Change is less than dust. Final fee without change output: ${estimatedFee} sats.`,
                    );
                }
            }
        }

        const finalValueLeft = BigInt(initialValue) - estimatedFee;

        if (finalValueLeft < 0) {
            throw new Error(
                `setFeeOutput: Insufficient funds to pay the fees. Required fee: ${estimatedFee}, Available: ${initialValue}. Total input: ${this.totalInputAmount} sat`,
            );
        }

        if (finalValueLeft >= TransactionBuilder.MINIMUM_DUST) {
            this.feeOutput = { ...output, value: toSatoshi(finalValueLeft) };
            this.overflowFees = finalValueLeft;
            if (this.debugFees) {
                this.log(
                    `setFeeOutput: Final change output set to ${finalValueLeft} sats. Final fee: ${estimatedFee} sats.`,
                );
            }
        } else {
            this.warn(
                `Amount to send back (${finalValueLeft} sat) is less than the minimum dust (${TransactionBuilder.MINIMUM_DUST} sat), it will be consumed in fees instead.`,
            );
            this.feeOutput = null;
            this.overflowFees = 0n;
        }
    }
    /*protected async setFeeOutput(output: PsbtOutputExtended): Promise<void> {
        const initialValue = output.value;

        const fee = await this.estimateTransactionFees();
        output.value = initialValue - Number(fee);

        if (output.value < TransactionBuilder.MINIMUM_DUST) {
            this.feeOutput = null;

            if (output.value < 0) {
                throw new Error(
                    `setFeeOutput: Insufficient funds to pay the fees. Fee: ${fee} < Value: ${initialValue}. Total input: ${this.totalInputAmount} sat`,
                );
            }
        } else {
            this.feeOutput = output;

            const fee = await this.estimateTransactionFees();
            if (fee > BigInt(initialValue)) {
                throw new Error(
                    `estimateTransactionFees: Insufficient funds to pay the fees. Fee: ${fee} > Value: ${initialValue}. Total input: ${this.totalInputAmount} sat`,
                );
            }

            const valueLeft = initialValue - Number(fee);
            if (valueLeft < TransactionBuilder.MINIMUM_DUST) {
                this.feeOutput = null;
            } else {
                this.feeOutput.value = valueLeft;
            }

            this.overflowFees = BigInt(valueLeft);
        }
    }*/

    /**
     * Builds the transaction.
     * @param {Psbt} transaction - The transaction to build
     * @param checkPartialSigs
     * @protected
     * @returns {Promise<boolean>}
     * @throws {Error} - If something went wrong while building the transaction
     */
    protected async internalBuildTransaction(
        transaction: Psbt,
        checkPartialSigs: boolean = false,
    ): Promise<boolean> {
        if (transaction.data.inputs.length === 0) {
            const inputs: PsbtInputExtended[] = this.getInputs();
            const outputs: PsbtOutputExtended[] = this.getOutputs();

            transaction.setMaximumFeeRate(this._maximumFeeRate);
            transaction.addInputs(inputs, checkPartialSigs);

            for (let i = 0; i < this.updateInputs.length; i++) {
                transaction.updateInput(i, this.updateInputs[i] as UpdateInput);
            }

            transaction.addOutputs(outputs);
        }

        try {
            await this.signInputs(transaction);

            if (this.finalized) {
                this.transactionFee = BigInt(transaction.getFee());
            }

            return true;
        } catch (e) {
            const err: Error = e as Error;

            this.error(
                `[internalBuildTransaction] Something went wrong while getting building the transaction: ${err.stack}`,
            );
        }

        return false;
    }
}
