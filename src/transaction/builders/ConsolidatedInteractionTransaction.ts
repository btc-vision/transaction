import { Buffer } from 'buffer';
import { Psbt, PsbtInput, Transaction, toXOnly } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { TransactionType } from '../enums/TransactionType.js';
import { MINIMUM_AMOUNT_REWARD, TransactionBuilder } from './TransactionBuilder.js';
import { HashCommitmentGenerator } from '../../generators/builders/HashCommitmentGenerator.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import {
    IConsolidatedInteractionParameters,
    IConsolidatedInteractionResult,
    IHashCommittedP2WSH,
    IRevealTransactionResult,
    ISetupTransactionResult,
} from '../interfaces/IConsolidatedTransactionParameters.js';
import { IP2WSHAddress } from '../mineable/IP2WSHAddress.js';
import { TimeLockGenerator } from '../mineable/TimelockGenerator.js';
import { ChallengeSolution } from '../../epoch/ChallengeSolution.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { Feature, FeaturePriority, Features } from '../../generators/Features.js';
import { AddressGenerator } from '../../generators/AddressGenerator.js';

/**
 * Consolidated Interaction Transaction
 *
 * Drop-in replacement for InteractionTransaction that bypasses BIP110/Bitcoin Knots censorship.
 *
 * Uses the same parameters and sends the same data on-chain as InteractionTransaction,
 * but embeds data in hash-committed P2WSH witnesses instead of Tapscript.
 *
 * Data is split into 80-byte chunks (P2WSH stack item limit), with up to 14 chunks
 * batched per P2WSH output (~1,120 bytes per output). Each output's witness script
 * commits to all its chunks via HASH160. When spent, all data chunks are revealed
 * in the witness and verified at consensus level.
 *
 * Policy limits respected:
 * - MAX_STANDARD_P2WSH_STACK_ITEM_SIZE = 80 bytes per chunk
 * - g_script_size_policy_limit = 1650 bytes total witness size (serialized)
 * - MAX_STANDARD_P2WSH_STACK_ITEMS = 100 items per witness
 *
 * Data integrity is consensus-enforced: if any data is stripped or modified,
 * HASH160(data) != committed_hash and the transaction is INVALID.
 *
 * Capacity: ~1.1KB per P2WSH output, ~220 outputs per reveal tx, ~242KB max.
 *
 * Usage:
 * ```typescript
 * // Same parameters as InteractionTransaction
 * const tx = new ConsolidatedInteractionTransaction({
 *     calldata: myCalldata,
 *     to: contractAddress,
 *     contract: contractSecret,
 *     challenge: myChallenge,
 *     utxos: myUtxos,
 *     signer: mySigner,
 *     network: networks.bitcoin,
 *     feeRate: 10,
 *     priorityFee: 0n,
 *     gasSatFee: 330n,
 * });
 *
 * const result = await tx.build();
 * // Broadcast setup first, then reveal (can use CPFP)
 * broadcast(result.setup.txHex);
 * broadcast(result.reveal.txHex);
 * ```
 */
export class ConsolidatedInteractionTransaction extends TransactionBuilder<TransactionType.INTERACTION> {
    public readonly type: TransactionType.INTERACTION = TransactionType.INTERACTION;

    /** The contract address (same as InteractionTransaction.to) */
    protected readonly contractAddress: string;

    /** The contract secret - 32 bytes (same as InteractionTransaction) */
    protected readonly contractSecret: Buffer;

    /** The compressed calldata (same as InteractionTransaction) */
    protected readonly calldata: Buffer;

    /** Challenge solution for epoch (same as InteractionTransaction) */
    protected readonly challenge: ChallengeSolution;

    /** Epoch challenge P2WSH address (same as InteractionTransaction) */
    protected readonly epochChallenge: IP2WSHAddress;

    /** Random bytes for interaction (same as InteractionTransaction) */
    public readonly randomBytes: Buffer;

    /** Script signer for interaction (same as InteractionTransaction) */
    protected readonly scriptSigner: ECPairInterface;

    /** Calldata generator - produces same output as InteractionTransaction */
    protected readonly calldataGenerator: CalldataGenerator;

    /** Hash commitment generator for CHCT */
    protected readonly hashCommitmentGenerator: HashCommitmentGenerator;

    /** The compiled operation data - SAME as InteractionTransaction's compiledTargetScript */
    protected readonly compiledTargetScript: Buffer;

    /** Generated hash-committed P2WSH outputs */
    protected readonly commitmentOutputs: IHashCommittedP2WSH[];

    /** Disable auto refund (same as InteractionTransaction) */
    protected readonly disableAutoRefund: boolean;

    /** Maximum chunk size (default: 80 bytes per P2WSH stack item limit) */
    protected readonly maxChunkSize: number;

    /** Cached value per output (calculated once, used by setup and reveal) */
    private cachedValuePerOutput: bigint | null = null;

    constructor(parameters: IConsolidatedInteractionParameters) {
        super(parameters);

        // Same validation as InteractionTransaction
        if (!parameters.to) {
            throw new Error('Contract address (to) is required');
        }

        if (!parameters.contract) {
            throw new Error('Contract secret (contract) is required');
        }

        if (!parameters.calldata) {
            throw new Error('Calldata is required');
        }

        if (!parameters.challenge) {
            throw new Error('Challenge solution is required');
        }

        this.contractAddress = parameters.to;
        this.contractSecret = Buffer.from(parameters.contract.replace('0x', ''), 'hex');
        this.disableAutoRefund = parameters.disableAutoRefund || false;
        this.maxChunkSize = parameters.maxChunkSize ?? HashCommitmentGenerator.MAX_CHUNK_SIZE;

        // Validate contract secret (same as InteractionTransaction)
        if (this.contractSecret.length !== 32) {
            throw new Error('Invalid contract secret length. Expected 32 bytes.');
        }

        // Compress calldata (same as SharedInteractionTransaction)
        this.calldata = Compressor.compress(parameters.calldata);

        // Generate random bytes and script signer (same as SharedInteractionTransaction)
        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();
        this.scriptSigner = EcKeyPair.fromSeedKeyPair(this.randomBytes, this.network);

        // Generate epoch challenge address (same as SharedInteractionTransaction)
        this.challenge = parameters.challenge;
        this.epochChallenge = TimeLockGenerator.generateTimeLockAddress(
            this.challenge.publicKey.originalPublicKeyBuffer(),
            this.network,
        );

        // Create calldata generator (same as SharedInteractionTransaction)
        this.calldataGenerator = new CalldataGenerator(
            Buffer.from(this.signer.publicKey),
            toXOnly(Buffer.from(this.scriptSigner.publicKey)),
            this.network,
        );

        // Compile the target script - SAME as InteractionTransaction
        if (parameters.compiledTargetScript) {
            if (Buffer.isBuffer(parameters.compiledTargetScript)) {
                this.compiledTargetScript = parameters.compiledTargetScript;
            } else if (typeof parameters.compiledTargetScript === 'string') {
                this.compiledTargetScript = Buffer.from(parameters.compiledTargetScript, 'hex');
            } else {
                throw new Error('Invalid compiled target script format.');
            }
        } else {
            this.compiledTargetScript = this.calldataGenerator.compile(
                this.calldata,
                this.contractSecret,
                this.challenge,
                this.priorityFee,
                this.generateFeatures(parameters),
            );
        }

        // Create hash commitment generator
        this.hashCommitmentGenerator = new HashCommitmentGenerator(
            Buffer.from(this.signer.publicKey),
            this.network,
        );

        // Split compiled data into hash-committed chunks
        this.commitmentOutputs = this.hashCommitmentGenerator.prepareChunks(
            this.compiledTargetScript,
            this.maxChunkSize,
        );

        // Validate output count
        this.validateOutputCount();

        const totalChunks = this.commitmentOutputs.reduce(
            (sum, output) => sum + output.dataChunks.length,
            0,
        );
        this.log(
            `ConsolidatedInteractionTransaction: ${this.commitmentOutputs.length} outputs, ` +
                `${totalChunks} chunks from ${this.compiledTargetScript.length} bytes compiled data`,
        );

        this.internalInit();
    }

    /**
     * Get the compiled target script (same as InteractionTransaction).
     */
    public exportCompiledTargetScript(): Buffer {
        return this.compiledTargetScript;
    }

    /**
     * Get the contract secret (same as InteractionTransaction).
     */
    public getContractSecret(): Buffer {
        return this.contractSecret;
    }

    /**
     * Get the random bytes (same as InteractionTransaction).
     */
    public getRndBytes(): Buffer {
        return this.randomBytes;
    }

    /**
     * Get the challenge solution (same as InteractionTransaction).
     */
    public getChallenge(): ChallengeSolution {
        return this.challenge;
    }

    /**
     * Get the commitment outputs for the setup transaction.
     */
    public getCommitmentOutputs(): IHashCommittedP2WSH[] {
        return this.commitmentOutputs;
    }

    /**
     * Get the number of P2WSH outputs.
     */
    public getOutputCount(): number {
        return this.commitmentOutputs.length;
    }

    /**
     * Get the total number of 80-byte chunks across all outputs.
     */
    public getTotalChunkCount(): number {
        return this.commitmentOutputs.reduce((sum, output) => sum + output.dataChunks.length, 0);
    }

    /**
     * Build both setup and reveal transactions.
     *
     * @returns Complete result with both transactions
     */
    public async build(): Promise<IConsolidatedInteractionResult> {
        // Build and sign setup transaction using base class flow
        const setupTx = await this.signTransaction();
        const setupTxId = setupTx.getId();

        const setup: ISetupTransactionResult = {
            txHex: setupTx.toHex(),
            txId: setupTxId,
            outputs: this.commitmentOutputs,
            feesPaid: this.transactionFee,
            chunkCount: this.getTotalChunkCount(),
            totalDataSize: this.compiledTargetScript.length,
        };

        this.log(`Setup transaction: ${setup.txId}`);

        // Build reveal transaction
        const reveal = this.buildRevealTransaction(setupTxId);

        return {
            setup,
            reveal,
            totalFees: setup.feesPaid + reveal.feesPaid,
        };
    }

    /**
     * Build the setup transaction.
     * Creates P2WSH outputs with hash commitments to the compiled data chunks.
     * This is called by signTransaction() in the base class.
     */
    protected override async buildTransaction(): Promise<void> {
        // Add funding UTXOs as inputs
        this.addInputsFromUTXO();

        // Calculate value per output (includes reveal fee + OPNet fee)
        const valuePerOutput = this.calculateValuePerOutput();

        // Add each hash-committed P2WSH as an output
        for (const commitment of this.commitmentOutputs) {
            this.addOutput({
                value: Number(valuePerOutput),
                address: commitment.address,
            });
        }

        // Calculate total spent on commitment outputs
        const totalCommitmentValue = BigInt(this.commitmentOutputs.length) * valuePerOutput;

        // Add optional outputs
        const optionalAmount = this.addOptionalOutputsAndGetAmount();

        // Add refund/change output
        await this.addRefundOutput(totalCommitmentValue + optionalAmount);
    }

    /**
     * Build the reveal transaction.
     * Spends the P2WSH commitment outputs, revealing the compiled data in witnesses.
     *
     * Output structure matches InteractionTransaction:
     * - Output to epochChallenge.address (miner reward)
     * - Change output (if any)
     *
     * @param setupTxId The transaction ID of the setup transaction
     */
    public buildRevealTransaction(setupTxId: string): IRevealTransactionResult {
        const revealPsbt = new Psbt({ network: this.network });

        // Get the value per output (same as used in setup transaction)
        const valuePerOutput = this.calculateValuePerOutput();

        // Add commitment outputs as inputs (from setup tx)
        for (let i = 0; i < this.commitmentOutputs.length; i++) {
            const commitment = this.commitmentOutputs[i];

            revealPsbt.addInput({
                hash: setupTxId,
                index: i,
                witnessUtxo: {
                    script: commitment.scriptPubKey,
                    value: Number(valuePerOutput),
                },
                witnessScript: commitment.witnessScript,
            });
        }

        // Calculate input value from commitments
        const inputValue = BigInt(this.commitmentOutputs.length) * valuePerOutput;

        // Calculate OPNet fee (same as InteractionTransaction)
        const opnetFee = this.getTransactionOPNetFee();
        const feeAmount = opnetFee < MINIMUM_AMOUNT_REWARD ? MINIMUM_AMOUNT_REWARD : opnetFee;

        // Add output to epoch challenge address (same as InteractionTransaction)
        revealPsbt.addOutput({
            address: this.epochChallenge.address,
            value: Number(feeAmount),
        });

        // Estimate reveal transaction fee
        const estimatedVBytes = this.estimateRevealVBytes();
        const revealFee = BigInt(Math.ceil(estimatedVBytes * this.feeRate));

        // Add change output if there's enough left
        const changeValue = inputValue - feeAmount - revealFee;
        if (changeValue > TransactionBuilder.MINIMUM_DUST) {
            const refundAddress = this.getRefundAddress();
            revealPsbt.addOutput({
                address: refundAddress,
                value: Number(changeValue),
            });
        }

        // Sign all commitment inputs
        for (let i = 0; i < this.commitmentOutputs.length; i++) {
            revealPsbt.signInput(i, this.signer);
        }

        // Finalize all inputs with hash-commitment finalizer
        for (let i = 0; i < this.commitmentOutputs.length; i++) {
            const commitment = this.commitmentOutputs[i];
            revealPsbt.finalizeInput(i, (_inputIndex: number, input: PsbtInput) => {
                return this.finalizeCommitmentInput(input, commitment);
            });
        }

        const revealTx: Transaction = revealPsbt.extractTransaction();

        const result: IRevealTransactionResult = {
            txHex: revealTx.toHex(),
            txId: revealTx.getId(),
            dataSize: this.compiledTargetScript.length,
            feesPaid: revealFee,
            inputCount: this.commitmentOutputs.length,
        };

        this.log(`Reveal transaction: ${result.txId}`);

        return result;
    }

    /**
     * Finalize a commitment input.
     *
     * Witness stack: [signature, data_1, data_2, ..., data_N, witnessScript]
     *
     * The witness script verifies each data chunk against its committed hash.
     * If any data is wrong or missing, the transaction is INVALID at consensus level.
     */
    private finalizeCommitmentInput(
        input: PsbtInput,
        commitment: IHashCommittedP2WSH,
    ): {
        finalScriptSig: Buffer | undefined;
        finalScriptWitness: Buffer | undefined;
    } {
        if (!input.partialSig || input.partialSig.length === 0) {
            throw new Error('No signature for commitment input');
        }

        if (!input.witnessScript) {
            throw new Error('No witness script for commitment input');
        }

        // Witness stack for hash-committed P2WSH with multiple chunks
        // Order: [signature, data_1, data_2, ..., data_N, witnessScript]
        const witnessStack: Buffer[] = [
            input.partialSig[0].signature, // Signature for OP_CHECKSIG
            ...commitment.dataChunks, // All data chunks for OP_HASH160 verification
            input.witnessScript, // The witness script
        ];

        return {
            finalScriptSig: undefined,
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witnessStack),
        };
    }

    /**
     * Estimate reveal transaction vBytes.
     */
    private estimateRevealVBytes(): number {
        const inputCount = this.commitmentOutputs.length;

        // Calculate actual witness weight based on chunks per output
        let witnessWeight = 0;
        for (const commitment of this.commitmentOutputs) {
            // Per input: 41 bytes base (× 4) + witness data
            // Witness: signature (~72) + chunks (N × 80) + script (N × 23 + 35) + overhead (~20)
            const numChunks = commitment.dataChunks.length;
            const chunkDataWeight = numChunks * 80; // actual data
            const scriptWeight = numChunks * 23 + 35; // witness script
            const sigWeight = 72;
            const overheadWeight = 20;

            witnessWeight += 164 + chunkDataWeight + scriptWeight + sigWeight + overheadWeight;
        }

        const weight = 40 + witnessWeight + 200; // tx overhead + witnesses + outputs
        return Math.ceil(weight / 4);
    }

    /**
     * Calculate the required value per commitment output.
     * This must cover: dust minimum + share of reveal fee + share of OPNet fee
     */
    private calculateValuePerOutput(): bigint {
        // Return cached value if already calculated
        if (this.cachedValuePerOutput !== null) {
            return this.cachedValuePerOutput;
        }

        const numOutputs = this.commitmentOutputs.length;

        // Calculate OPNet fee
        const opnetFee = this.getTransactionOPNetFee();
        const feeAmount = opnetFee < MINIMUM_AMOUNT_REWARD ? MINIMUM_AMOUNT_REWARD : opnetFee;

        // Calculate reveal fee
        const estimatedVBytes = this.estimateRevealVBytes();
        const revealFee = BigInt(Math.ceil(estimatedVBytes * this.feeRate));

        // Total needed: OPNet fee + reveal fee + dust for change
        const totalNeeded = feeAmount + revealFee + TransactionBuilder.MINIMUM_DUST;

        // Distribute across outputs, ensuring at least MIN_OUTPUT_VALUE per output
        const valuePerOutput = BigInt(Math.ceil(Number(totalNeeded) / numOutputs));
        const minValue = HashCommitmentGenerator.MIN_OUTPUT_VALUE;

        this.cachedValuePerOutput = valuePerOutput > minValue ? valuePerOutput : minValue;
        return this.cachedValuePerOutput;
    }

    /**
     * Get the value per commitment output (for external access).
     */
    public getValuePerOutput(): bigint {
        return this.calculateValuePerOutput();
    }

    /**
     * Get refund address.
     */
    private getRefundAddress(): string {
        if (this.from) {
            return this.from;
        }

        return AddressGenerator.generatePKSH(this.signer.publicKey, this.network);
    }

    /**
     * Generate features (same as InteractionTransaction).
     */
    private generateFeatures(parameters: IConsolidatedInteractionParameters): Feature<Features>[] {
        const features: Feature<Features>[] = [];

        if (parameters.loadedStorage) {
            features.push({
                priority: FeaturePriority.ACCESS_LIST,
                opcode: Features.ACCESS_LIST,
                data: parameters.loadedStorage,
            });
        }

        const submission = parameters.challenge.getSubmission();
        if (submission) {
            features.push({
                priority: FeaturePriority.EPOCH_SUBMISSION,
                opcode: Features.EPOCH_SUBMISSION,
                data: submission,
            });
        }

        if (parameters.revealMLDSAPublicKey && !parameters.linkMLDSAPublicKeyToAddress) {
            throw new Error(
                'To reveal the MLDSA public key, you must set linkMLDSAPublicKeyToAddress to true.',
            );
        }

        if (parameters.linkMLDSAPublicKeyToAddress) {
            this.generateMLDSALinkRequest(parameters, features);
        }

        return features;
    }

    /**
     * Validate output count is within standard tx limits.
     */
    private validateOutputCount(): void {
        const maxInputs = HashCommitmentGenerator.calculateMaxInputsPerTx();

        if (this.commitmentOutputs.length > maxInputs) {
            const maxData = HashCommitmentGenerator.calculateMaxDataPerTx();
            throw new Error(
                `Data too large: ${this.commitmentOutputs.length} P2WSH outputs needed, ` +
                    `max ${maxInputs} per standard transaction (~${Math.floor(maxData / 1024)}KB). ` +
                    `Compiled data: ${this.compiledTargetScript.length} bytes.`,
            );
        }
    }
}
