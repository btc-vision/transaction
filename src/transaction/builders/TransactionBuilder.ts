import {
    initEccLib,
    Network,
    opcodes,
    Psbt,
    PsbtInputExtended,
    PsbtOutputExtended,
    script,
    Signer,
    Transaction,
    varuint,
} from '@btc-vision/bitcoin';
import * as ecc from '@bitcoinerlab/secp256k1';
import { UpdateInput } from '../interfaces/Tap.js';
import { TransactionType } from '../enums/TransactionType.js';
import {
    IFundingTransactionParameters,
    ITransactionParameters,
} from '../interfaces/ITransactionParameters.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ECPairInterface } from 'ecpair';
import { AddressVerificator } from '../../keypair/AddressVerificator.js';
import { TweakedTransaction } from '../shared/TweakedTransaction.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';

initEccLib(ecc);

export const MINIMUM_AMOUNT_REWARD: bigint = 540n;
export const MINIMUM_AMOUNT_CA: bigint = 297n;

/**
 * Allows to build a transaction like you would on Ethereum.
 * @description The transaction builder class
 * @abstract
 * @class TransactionBuilder
 */
export abstract class TransactionBuilder<T extends TransactionType> extends TweakedTransaction {
    // Cancel script
    public static readonly LOCK_LEAF_SCRIPT: Buffer = script.compile([
        opcodes.OP_FALSE,
        opcodes.OP_VERIFY,
    ]);

    public static readonly MINIMUM_DUST: bigint = 50n;

    public abstract readonly type: T;
    public readonly logColor: string = '#785def';

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
    protected readonly signer: Signer | ECPairInterface | UnisatSigner;

    /**
     * @description The network where the transaction will be broadcasted
     */
    protected readonly network: Network;

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

    protected note?: Buffer;

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

        if (parameters.note) {
            if (typeof parameters.note === 'string') {
                this.note = Buffer.from(parameters.note, 'utf8');
            } else {
                this.note = parameters.note;
            }
        }

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
        });
    }

    public static getFrom(
        from: string | undefined,
        keypair: ECPairInterface | Signer,
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
    public static witnessStackToScriptWitness(witness: Buffer[]): Buffer {
        let buffer = Buffer.allocUnsafe(0);

        function writeSlice(slice: Buffer) {
            buffer = Buffer.concat([buffer, Buffer.from(slice)]);
        }

        function writeVarInt(i: number) {
            const currentLen = buffer.length;
            const varintLen = varuint.encodingLength(i);

            buffer = Buffer.concat([buffer, Buffer.allocUnsafe(varintLen)]);
            varuint.encode(i, buffer, currentLen);
        }

        function writeVarSlice(slice: Buffer) {
            writeVarInt(slice.length);
            writeSlice(slice);
        }

        function writeVector(vector: Buffer[]) {
            writeVarInt(vector.length);
            vector.forEach(writeVarSlice);
        }

        writeVector(witness);

        return buffer;
    }

    public addOPReturn(buffer: Buffer): void {
        const compileScript = script.compile([opcodes.OP_RETURN, buffer]);

        this.addOutput({
            value: 0,
            script: compileScript,
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
            optionalOutputs: this.optionalOutputs,
            optionalInputs: this.optionalInputs,
        };
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
                this.transaction.updateInput(i, this.updateInputs[i]);
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
     * @public
     * @returns {void}
     */
    public addOutput(output: PsbtOutputExtended): void {
        if (output.value === 0) {
            const script = output as {
                script: Buffer;
            };

            if (!script.script || script.script.length === 0) {
                throw new Error('Output value is 0 and no script provided');
            }

            if (script.script.length < 2) {
                throw new Error('Output script is too short');
            }

            if (script.script[0] !== opcodes.OP_RETURN) {
                throw new Error('Output script must start with OP_RETURN when value is 0');
            }
        } else if (output.value < TransactionBuilder.MINIMUM_DUST) {
            throw new Error(
                `Output value is less than the minimum dust ${output.value} < ${TransactionBuilder.MINIMUM_DUST}`,
            );
        }

        this.outputs.push(output);
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
     * Estimates the transaction fees.
     * @public
     * @returns {Promise<bigint>} - The estimated transaction fees
     */
    public async estimateTransactionFees(): Promise<bigint> {
        if (!this.utxos.length) {
            throw new Error('No UTXOs specified');
        }

        if (this.estimatedFees) return this.estimatedFees;

        const fakeTx = new Psbt({
            network: this.network,
        });

        const builtTx = await this.internalBuildTransaction(fakeTx);
        if (builtTx) {
            const tx = fakeTx.extractTransaction(true, true);
            const size = tx.virtualSize();
            const fee: number = this.feeRate * size;

            this.estimatedFees = BigInt(Math.ceil(fee) + 1);

            return this.estimatedFees;
        } else {
            throw new Error(
                `Could not build transaction to estimate fee. Something went wrong while building the transaction.`,
            );
        }
    }

    public async rebuildFromBase64(base64: string): Promise<Psbt> {
        this.transaction = Psbt.fromBase64(base64, { network: this.network });
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
            total += BigInt(this.optionalOutputs[i].value);
        }

        return total;
    }

    /**
     * @description Adds the refund output to the transaction
     * @param {bigint} amountSpent - The amount spent
     * @protected
     * @returns {Promise<void>}
     */
    protected async addRefundOutput(amountSpent: bigint): Promise<void> {
        if (this.note) {
            this.addOPReturn(this.note);
        }

        /** Add the refund output */
        const sendBackAmount: bigint = this.totalInputAmount - amountSpent;
        if (sendBackAmount >= TransactionBuilder.MINIMUM_DUST) {
            if (AddressVerificator.isValidP2TRAddress(this.from, this.network)) {
                await this.setFeeOutput({
                    value: Number(sendBackAmount),
                    address: this.from,
                    tapInternalKey: this.internalPubKeyToXOnly(),
                });
            } else if (AddressVerificator.isValidPublicKey(this.from, this.network)) {
                const pubKeyScript = script.compile([
                    Buffer.from(this.from.replace('0x', ''), 'hex'),
                    opcodes.OP_CHECKSIG,
                ]);

                await this.setFeeOutput({
                    value: Number(sendBackAmount),
                    script: pubKeyScript,
                });
            } else {
                await this.setFeeOutput({
                    value: Number(sendBackAmount),
                    address: this.from,
                });
            }

            return;
        }

        this.warn(
            `Amount to send back (${sendBackAmount} sat) is less than the minimum dust (${TransactionBuilder.MINIMUM_DUST} sat), it will be consumed in fees instead.`,
        );
    }

    /**
     * @description Adds the value to the output
     * @param {number | bigint} value - The value to add
     * @protected
     * @returns {void}
     */
    protected addValueToToOutput(value: number | bigint): void {
        if (value < TransactionBuilder.MINIMUM_DUST) {
            throw new Error(
                `Value to send is less than the minimum dust ${value} < ${TransactionBuilder.MINIMUM_DUST}`,
            );
        }

        for (const output of this.outputs) {
            if ('address' in output && output.address === this.to) {
                output.value += Number(value);
                return;
            }
        }

        throw new Error('Output not found');
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
        if (!this.optionalOutputs) return 0n;

        let refundedFromOptionalOutputs = 0n;

        for (let i = 0; i < this.optionalOutputs.length; i++) {
            this.addOutput(this.optionalOutputs[i]);
            refundedFromOptionalOutputs += BigInt(this.optionalOutputs[i].value);
        }
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
                const utxo = this.utxos[i];
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
                const utxo = this.optionalInputs[i - this.utxos.length];
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
     * Returns the witness of the tap transaction.
     * @protected
     * @returns {Buffer}
     */
    protected getWitness(): Buffer {
        if (!this.tapData || !this.tapData.witness) {
            throw new Error('Witness is required');
        }

        if (this.tapData.witness.length === 0) {
            throw new Error('Witness is empty');
        }

        return this.tapData.witness[this.tapData.witness.length - 1];
    }

    /**
     * Returns the tap output.
     * @protected
     * @returns {Buffer}
     */
    protected getTapOutput(): Buffer {
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
    }

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
                transaction.updateInput(i, this.updateInputs[i]);
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
