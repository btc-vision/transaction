import { Buffer } from 'buffer';
import { Psbt, PsbtInput, toXOnly } from '@btc-vision/bitcoin';
import { TransactionType } from '../enums/TransactionType.js';
import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { MessageSigner } from '../../keypair/MessageSigner.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { P2WDAGenerator } from '../../generators/builders/P2WDAGenerator.js';
import { Feature, FeaturePriority, Features } from '../../generators/Features.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { IChallengeSolution } from '../../epoch/interfaces/IChallengeSolution.js';
import { ECPairInterface } from 'ecpair';
import { P2WDADetector } from '../../p2wda/P2WDADetector.js';
import { IP2WSHAddress } from '../mineable/IP2WSHAddress.js';
import { TimeLockGenerator } from '../mineable/TimelockGenerator.js';

/**
 * P2WDA Interaction Transaction
 *
 * This transaction type uses the exact same operation data as regular interactions
 * (via CalldataGenerator), but embeds it in the witness field instead of a taproot script.
 * This achieves 75% cost reduction through the witness discount.
 */
export class InteractionTransactionP2WDA extends TransactionBuilder<TransactionType.INTERACTION> {
    private static readonly MAX_WITNESS_FIELDS = 10;
    private static readonly MAX_BYTES_PER_WITNESS = 80;

    public readonly type: TransactionType.INTERACTION = TransactionType.INTERACTION;
    protected readonly epochChallenge: IP2WSHAddress;
    /**
     * Disable auto refund
     * @protected
     */
    protected readonly disableAutoRefund: boolean;
    private readonly contractAddress: string;
    private readonly contractSecret: Buffer;
    private readonly calldata: Buffer;
    private readonly challenge: IChallengeSolution;
    private readonly randomBytes: Buffer;
    private p2wdaGenerator: P2WDAGenerator;
    private scriptSigner: ECPairInterface;
    private p2wdaInputIndices: Set<number> = new Set();
    /**
     * The compiled operation data from CalldataGenerator
     * This is exactly what would go in a taproot script, but we put it in witness instead
     */
    private readonly compiledOperationData: Buffer | null = null;

    public constructor(parameters: IInteractionParameters) {
        super(parameters);

        if (!parameters.to) {
            throw new Error('Contract address (to) is required');
        }

        if (!parameters.contract) {
            throw new Error('Contract secret is required');
        }

        if (!parameters.calldata) {
            throw new Error('Calldata is required');
        }

        if (!parameters.challenge) {
            throw new Error('Challenge solution is required');
        }

        this.disableAutoRefund = parameters.disableAutoRefund || false;
        this.contractAddress = parameters.to;
        this.contractSecret = Buffer.from(parameters.contract.replace('0x', ''), 'hex');
        this.calldata = Compressor.compress(parameters.calldata);
        this.challenge = parameters.challenge;
        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();

        // Create the script signer (same as SharedInteractionTransaction does)
        this.scriptSigner = this.generateKeyPairFromSeed();

        // Create the P2WDA generator instead of CalldataGenerator
        // P2WDA needs a different data format optimized for witness embedding
        this.p2wdaGenerator = new P2WDAGenerator(
            Buffer.from(this.signer.publicKey),
            this.scriptSignerXOnlyPubKey(),
            this.network,
        );

        // Validate contract secret
        if (this.contractSecret.length !== 32) {
            throw new Error('Invalid contract secret length. Expected 32 bytes.');
        }

        this.epochChallenge = TimeLockGenerator.generateTimeLockAddress(
            this.challenge.publicKey.originalPublicKeyBuffer(),
            this.network,
        );

        // Validate P2WDA inputs
        this.validateP2WDAInputs();

        if (parameters.compiledTargetScript) {
            if (Buffer.isBuffer(parameters.compiledTargetScript)) {
                this.compiledOperationData = parameters.compiledTargetScript;
            } else if (typeof parameters.compiledTargetScript === 'string') {
                this.compiledOperationData = Buffer.from(parameters.compiledTargetScript, 'hex');
            } else {
                throw new Error('Invalid compiled target script format.');
            }
        } else {
            this.compiledOperationData = this.p2wdaGenerator.compile(
                this.calldata,
                this.contractSecret,
                this.challenge,
                this.priorityFee,
                this.generateFeatures(parameters),
            );
        }

        // Validate size early
        this.validateOperationDataSize();

        this.internalInit();
    }

    /**
     * Get random bytes (for compatibility if needed elsewhere)
     */
    public getRndBytes(): Buffer {
        return this.randomBytes;
    }

    /**
     * Get the challenge (for compatibility if needed elsewhere)
     */
    public getChallenge(): IChallengeSolution {
        return this.challenge;
    }

    /**
     * Get contract secret (for compatibility if needed elsewhere)
     */
    public getContractSecret(): Buffer {
        return this.contractSecret;
    }

    /**
     * Build the transaction
     */
    protected async buildTransaction(): Promise<void> {
        if (!this.regenerated) {
            this.addInputsFromUTXO();
        }

        // Add refund
        await this.createMineableRewardOutputs();
    }

    protected async createMineableRewardOutputs(): Promise<void> {
        if (!this.to) throw new Error('To address is required');

        const amountSpent: bigint = this.getTransactionOPNetFee();

        this.addFeeToOutput(amountSpent, this.to, this.epochChallenge, false);

        const amount = this.addOptionalOutputsAndGetAmount();
        if (!this.disableAutoRefund) {
            await this.addRefundOutput(amountSpent + amount);
        }
    }

    /**
     * Sign inputs with P2WDA-specific handling
     */
    protected override async signInputs(transaction: Psbt): Promise<void> {
        // Sign all inputs
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            await this.signInput(transaction, transaction.data.inputs[i], i, this.signer);
        }

        // Finalize with appropriate finalizers
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            if (this.p2wdaInputIndices.has(i)) {
                if (i === 0) {
                    transaction.finalizeInput(i, this.finalizePrimaryP2WDA.bind(this));
                } else {
                    transaction.finalizeInput(i, this.finalizeSecondaryP2WDA.bind(this));
                }
            } else {
                transaction.finalizeInput(i, this.customFinalizerP2SH.bind(this));
            }
        }

        this.finalized = true;
    }

    /**
     * Generate features array (same as InteractionTransaction)
     */
    private generateFeatures(parameters: IInteractionParameters): Feature<Features>[] {
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

        return features;
    }

    /**
     * Generate keypair from seed (same as SharedInteractionTransaction)
     */
    private generateKeyPairFromSeed(): ECPairInterface {
        return EcKeyPair.fromSeedKeyPair(this.randomBytes, this.network);
    }

    /**
     * Get script signer x-only pubkey (same as SharedInteractionTransaction)
     */
    private scriptSignerXOnlyPubKey(): Buffer {
        return toXOnly(Buffer.from(this.scriptSigner.publicKey));
    }

    /**
     * Validate that input 0 is P2WDA
     */
    private validateP2WDAInputs(): void {
        if (this.utxos.length === 0 || !P2WDADetector.isP2WDAUTXO(this.utxos[0])) {
            throw new Error('Input 0 must be a P2WDA UTXO');
        }

        // Track all P2WDA inputs
        for (let i = 0; i < this.utxos.length; i++) {
            if (P2WDADetector.isP2WDAUTXO(this.utxos[i])) {
                this.p2wdaInputIndices.add(i);
            }
        }

        for (let i = 0; i < this.optionalInputs.length; i++) {
            const actualIndex = this.utxos.length + i;
            if (P2WDADetector.isP2WDAUTXO(this.optionalInputs[i])) {
                this.p2wdaInputIndices.add(actualIndex);
            }
        }
    }

    /**
     * Validate the compiled operation data will fit in witness fields
     */
    private validateOperationDataSize(): void {
        if (!this.compiledOperationData) {
            throw new Error('Operation data not compiled');
        }

        // The data that goes in witness: COMPRESS(signature + compiledOperationData)
        // Signature is 64 bytes
        const estimatedSize = this.compiledOperationData.length;

        if (!P2WDAGenerator.validateWitnessSize(estimatedSize)) {
            const signatureSize = 64;
            const totalSize = estimatedSize + signatureSize;
            const compressedEstimate = Math.ceil(totalSize * 0.7);
            const requiredFields = Math.ceil(
                compressedEstimate / InteractionTransactionP2WDA.MAX_BYTES_PER_WITNESS,
            );

            throw new Error(
                `Please dont use P2WDA for this operation. Data too large. Raw size: ${estimatedSize} bytes, ` +
                    `estimated compressed: ${compressedEstimate} bytes, ` +
                    `needs ${requiredFields} witness fields, max is ${InteractionTransactionP2WDA.MAX_WITNESS_FIELDS}`,
            );
        }
    }

    /**
     * Finalize primary P2WDA input with the operation data
     * This is where we create the signature and compress everything
     */
    private finalizePrimaryP2WDA(
        inputIndex: number,
        input: PsbtInput,
    ): {
        finalScriptSig: Buffer | undefined;
        finalScriptWitness: Buffer | undefined;
    } {
        if (!input.partialSig || input.partialSig.length === 0) {
            throw new Error(`No signature for P2WDA input #${inputIndex}`);
        }

        if (!input.witnessScript) {
            throw new Error(`No witness script for P2WDA input #${inputIndex}`);
        }

        if (!this.compiledOperationData) {
            throw new Error('Operation data not compiled');
        }

        const txSignature = input.partialSig[0].signature;
        const messageToSign = Buffer.concat([txSignature, this.compiledOperationData]);
        const signedMessage = MessageSigner.signMessage(
            this.signer as ECPairInterface,
            messageToSign,
        );

        const schnorrSignature = Buffer.from(signedMessage.signature);

        // Combine and compress: COMPRESS(signature + compiledOperationData)
        const fullData = Buffer.concat([schnorrSignature, this.compiledOperationData]);
        const compressedData = Compressor.compress(fullData);

        // Split into chunks
        const chunks = this.splitIntoWitnessChunks(compressedData);

        if (chunks.length > InteractionTransactionP2WDA.MAX_WITNESS_FIELDS) {
            throw new Error(
                `Compressed data needs ${chunks.length} witness fields, max is ${InteractionTransactionP2WDA.MAX_WITNESS_FIELDS}`,
            );
        }

        // Build witness stack
        const witnessStack: Buffer[] = [txSignature];

        // Add exactly 10 data fields
        // Bitcoin stack is reversed!
        for (let i = 0; i < InteractionTransactionP2WDA.MAX_WITNESS_FIELDS; i++) {
            witnessStack.push(i < chunks.length ? chunks[i] : Buffer.alloc(0));
        }

        witnessStack.push(input.witnessScript);

        return {
            finalScriptSig: undefined,
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witnessStack),
        };
    }

    /**
     * Split data into 80-byte chunks
     */
    private splitIntoWitnessChunks(data: Buffer): Buffer[] {
        const chunks: Buffer[] = [];
        let offset = 0;

        while (offset < data.length) {
            const size = Math.min(
                InteractionTransactionP2WDA.MAX_BYTES_PER_WITNESS,
                data.length - offset,
            );
            chunks.push(Buffer.from(data.subarray(offset, offset + size)));
            offset += size;
        }

        return chunks;
    }
}
