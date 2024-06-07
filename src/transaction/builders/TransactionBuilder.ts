import { initEccLib, Network, opcodes, Payment, payments, Psbt, script, Signer, Transaction } from 'bitcoinjs-lib';
import { varuint } from 'bitcoinjs-lib/src/bufferutils.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import * as ecc from 'tiny-secp256k1';
import { PsbtInputExtended, PsbtOutputExtended, UpdateInput } from '../interfaces/Tap.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IFundingTransactionParameters, ITransactionParameters } from '../interfaces/ITransactionParameters.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { Address } from '@btc-vision/bsi-binary';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ECPairInterface } from 'ecpair';
import { Logger } from '@btc-vision/logger';

/**
 * Allows to build a transaction like you would on Ethereum.
 * @description The transaction builder class
 * @abstract
 * @class TransactionBuilder
 */
export abstract class TransactionBuilder<T extends TransactionType> extends Logger {
    public static readonly LOCK_LEAF_SCRIPT: Buffer = script.compile([
        opcodes.OP_0,
        opcodes.OP_VERIFY,
    ]);

    public static readonly MINIMUM_DUST: bigint = 330n;

    public abstract readonly type: T;
    public readonly logColor: string = '#785def';

    /**
     * @description Cost in satoshis of the transaction fee
     */
    public transactionFee: bigint = 0n;
    /**
     * @description The transaction itself.
     */
    protected readonly transaction: Psbt;
    /**
     * @description The inputs of the transaction
     */
    protected readonly inputs: PsbtInputExtended[] = [];
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
     * @description Was the transaction signed?
     */
    protected signed: boolean = false;
    /**
     * @description The tap data of the transaction
     */
    protected tapData: Payment | null = null;
    /**
     * @description The script data of the transaction
     */
    protected scriptData: Payment | null = null;
    /**
     * @description The total amount of satoshis in the inputs
     */
    protected totalInputAmount: bigint;
    /**
     * @description The signer of the transaction
     */
    protected readonly signer: Signer;
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
    protected readonly priorityFee: bigint;
    /**
     * @description The utxos used in the transaction
     */
    protected utxos: UTXO[];

    /**
     * @description The address where the transaction is sent to
     * @protected
     */
    protected to: Address;

    /**
     * @description The address where the transaction is sent from
     * @protected
     */
    protected from: Address;

    /**
     * @description The maximum fee rate of the transaction
     */
    private _maximumFeeRate: number = 100000000;

    /**
     * @param {ITransactionParameters} parameters - The transaction parameters
     */
    protected constructor(parameters: ITransactionParameters) {
        super();

        this.signer = parameters.signer;
        this.network = parameters.network;
        this.feeRate = parameters.feeRate;
        this.priorityFee = parameters.priorityFee;
        this.utxos = parameters.utxos;
        this.to = parameters.to;
        this.from =
            parameters.from ||
            EcKeyPair.getTaprootAddress(this.signer as ECPairInterface, this.network);

        this.totalInputAmount = this.calculateTotalUTXOAmount();
        const totalVOut: bigint = this.calculateTotalVOutAmount();

        if (totalVOut < this.totalInputAmount) {
            throw new Error(`Vout value is less than the value to send`);
        }

        if (this.totalInputAmount < TransactionBuilder.MINIMUM_DUST) {
            throw new Error(`Value is less than the minimum dust`);
        }

        this.transaction = new Psbt({
            network: this.network,
        });
    }

    public getFundingTransactionParameters(): IFundingTransactionParameters {
        return {
            utxos: this.utxos,
            to: this.getScriptAddress(),
            signer: this.signer,
            network: this.network,
            feeRate: this.feeRate,
            priorityFee: this.priorityFee,
            from: this.from,
            childTransactionRequiredFees: this.transactionFee,
        };
    }

    /**
     * Set the destination address of the transaction
     * @param {Address} address - The address to set
     */
    public setDestinationAddress(address: Address): void {
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
     * @returns {Transaction} - The signed transaction in hex format
     * @throws {Error} - If something went wrong
     */
    public signTransaction(): Transaction {
        if (!this.to) throw new Error('Transaction must have a recipient');

        if (!EcKeyPair.verifyContractAddress(this.to, this.network)) {
            throw new Error(
                'Invalid contract address. The contract address must be a taproot address.',
            );
        }

        if (this.signed) throw new Error('Transaction is already signed');
        this.signed = true;

        this.buildTransaction();

        const builtTx = this.internalBuildTransaction(this.transaction);
        if (builtTx) {
            return this.transaction.extractTransaction(false);
        }

        throw new Error('Could not sign transaction');
    }

    /**
     * @description Returns the transaction
     * @returns {Transaction}
     */
    public getTransaction(): Transaction {
        return this.transaction.extractTransaction(false);
    }

    /**
     * @description Returns the script address
     * @returns {string}
     */
    public getScriptAddress(): string {
        if (!this.scriptData || !this.scriptData.address) {
            throw new Error('Tap data is required');
        }

        return this.scriptData.address;
    }

    /**
     * @description Disables replace by fee on the transaction
     */
    public disableRBF(): void {
        if (this.signed) throw new Error('Transaction is already signed');

        for (let input of this.inputs) {
            input.sequence = 0xffffffff;
        }
    }

    /**
     * @description Returns the tap address
     * @returns {string}
     * @throws {Error} - If tap data is not set
     */
    public getTapAddress(): string {
        if (!this.tapData || !this.tapData.address) {
            throw new Error('Tap data is required');
        }

        return this.tapData.address;
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
        if (output.value < TransactionBuilder.MINIMUM_DUST) {
            throw new Error(
                `Output value is less than the minimum dust ${output.value} < ${TransactionBuilder.MINIMUM_DUST}`,
            );
        }

        this.outputs.push(output);
    }

    /**
     * @description Adds the refund output to the transaction
     * @param {bigint} amountSpent - The amount spent
     * @protected
     * @returns {void}
     */
    protected addRefundOutput(amountSpent: bigint): void {
        /** Add the refund output */
        const sendBackAmount: bigint = this.totalInputAmount - amountSpent;
        if (sendBackAmount >= TransactionBuilder.MINIMUM_DUST) {
            this.setFeeOutput({
                value: Number(sendBackAmount),
                address: this.from,
            });

            return;
        }

        this.warn(
            `Amount to send back is less than the minimum dust, will be consumed in fees instead.`,
        );
    }

    /**
     * @description Returns the transaction opnet fee
     * @protected
     * @returns {bigint}
     */
    protected getTransactionOPNetFee(): bigint {
        if (this.priorityFee > TransactionBuilder.MINIMUM_DUST) {
            return this.priorityFee;
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
        for (let utxo of this.utxos) {
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
        for (let utxo of this.utxos) {
            total += utxo.value;
        }

        return total;
    }

    /**
     * @description Adds the inputs from the utxos
     * @protected
     * @returns {void}
     */
    protected addInputsFromUTXO(): void {
        for (let utxo of this.utxos) {
            const input: PsbtInputExtended = {
                hash: utxo.transactionId,
                index: utxo.outputIndex,
                witnessUtxo: {
                    value: Number(utxo.value),
                    script: Buffer.from(utxo.scriptPubKey.hex, 'hex'),
                },
                sequence: 0xfffffffd,
            };

            this.addInput(input);
        }
    }

    /**
     * @description Converts the witness stack to a script witness
     * @param {Buffer[]} witness - The witness stack
     * @protected
     * @returns {Buffer}
     */
    protected witnessStackToScriptWitness(witness: Buffer[]): Buffer {
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

    /**
     * Internal init.
     * @protected
     */
    protected internalInit(): void {
        this.verifyUTXOValidity();

        this.scriptData = payments.p2tr(this.generateScriptAddress());
        this.tapData = payments.p2tr(this.generateTapData());
    }

    /**
     * Builds the transaction.
     * @protected
     * @returns {void}
     */
    protected abstract buildTransaction(): void;

    /**
     * Generates the script address.
     * @protected
     * @returns {Payment}
     */
    protected generateScriptAddress(): Payment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
        };
    }

    protected generateTapData(): Payment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
        };
    }

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
     * Returns the inputs of the transaction.
     * @protected
     * @returns {PsbtInputExtended[]}
     */
    protected getInputs(): PsbtInputExtended[] {
        return this.inputs;
    }

    /**
     * Returns the outputs of the transaction.
     * @protected
     * @returns {PsbtOutputExtended[]}
     */
    protected getOutputs(): PsbtOutputExtended[] {
        const outputs: PsbtOutputExtended[] = [...this.outputs];
        if (this.feeOutput) outputs.push(this.feeOutput);

        return outputs;
    }

    /**
     * Verifies that the utxos are valid.
     * @protected
     */
    protected verifyUTXOValidity(): void {
        for (let utxo of this.utxos) {
            if (!utxo.scriptPubKey) {
                throw new Error('Address is required');
            }
        }
    }

    /**
     * Set transaction fee output.
     * @param {PsbtOutputExtended} output - The output to set the fees
     * @protected
     * @returns {void}
     */
    protected setFeeOutput(output: PsbtOutputExtended): void {
        const initialValue = output.value;

        this.feeOutput = output;

        const fee = this.estimateTransactionFees();
        if (fee > BigInt(initialValue)) {
            throw new Error('Insufficient funds');
        }

        this.feeOutput.value = initialValue - Number(fee);

        if (this.feeOutput.value < TransactionBuilder.MINIMUM_DUST) {
            this.feeOutput = null;
        }
    }

    /**
     * Returns the signer key.
     * @protected
     * @returns {Signer}
     */
    protected abstract getSignerKey(): Signer;

    /**
     * Converts the public key to x-only.
     * @protected
     * @returns {Buffer}
     */
    protected internalPubKeyToXOnly(): Buffer {
        return toXOnly(this.signer.publicKey);
    }

    /**
     * Signs all the inputs of the transaction.
     * @param {Psbt} transaction - The transaction to sign
     * @protected
     * @returns {void}
     */
    protected signInputs(transaction: Psbt): void {
        transaction.signAllInputs(this.getSignerKey());
        transaction.finalizeAllInputs();
    }

    /**
     * Builds the transaction.
     * @param {Psbt} transaction - The transaction to build
     * @protected
     * @returns {boolean}
     * @throws {Error} - If something went wrong while building the transaction
     */
    private internalBuildTransaction(transaction: Psbt): boolean {
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
            this.transactionFee = BigInt(transaction.getFee());

            return true;
        } catch (e) {
            const err: Error = e as Error;

            this.error(
                `[internalBuildTransaction] Something went wrong while getting building the transaction: ${err.stack}`,
            );
        }

        return false;
    }

    /**
     * Estimates the transaction fees.
     * @private
     */
    private estimateTransactionFees(): bigint {
        const fakeTx = new Psbt({
            network: this.network,
        });

        const builtTx = this.internalBuildTransaction(fakeTx);
        if (builtTx) {
            const tx = fakeTx.extractTransaction(false);
            const size = tx.virtualSize();
            const fee: number = this.feeRate * size + 1;

            return BigInt(Math.ceil(fee));
        } else {
            throw new Error(
                `Could not build transaction to estimate fee. Something went wrong while building the transaction.`,
            );
        }
    }
}

initEccLib(ecc);
