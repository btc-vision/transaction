import { createHash } from 'crypto';
import { fromHex, toHex } from '@btc-vision/bitcoin';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';
import { BinaryReader } from '../../buffer/BinaryReader.js';
import type {
    ISerializableTransactionState,
    PrecomputedData,
    SerializationHeader,
    SerializedBaseParams,
    SerializedOutput,
    SerializedSignerMapping,
    SerializedUTXO,
} from './interfaces/ISerializableState.js';
import { SERIALIZATION_FORMAT_VERSION, SERIALIZATION_MAGIC_BYTE, } from './interfaces/ISerializableState.js';
import type {
    CancelSpecificData,
    CustomScriptSpecificData,
    DeploymentSpecificData,
    FundingSpecificData,
    InteractionSpecificData,
    MultiSigSpecificData,
    SerializedLoadedStorage,
    SerializedScriptElement,
    TypeSpecificData,
} from './interfaces/ITypeSpecificData.js';
import { TransactionType } from '../enums/TransactionType.js';
import type { RawChallenge, RawChallengeVerification, } from '../../epoch/interfaces/IChallengeSolution.js';

/**
 * Serializes and deserializes transaction state for offline signing.
 * Uses binary format for compact size.
 */
export class TransactionSerializer {
    /**
     * Serialize transaction state to binary format
     * @param state - The transaction state to serialize
     * @returns Uint8Array containing serialized state with checksum
     */
    public static serialize(state: ISerializableTransactionState): Uint8Array {
        const writer = new BinaryWriter();

        // Write header
        this.writeHeader(writer, state.header);

        // Write base params
        this.writeBaseParams(writer, state.baseParams);

        // Write UTXOs
        this.writeUTXOArray(writer, state.utxos);
        this.writeUTXOArray(writer, state.optionalInputs);

        // Write optional outputs
        this.writeOutputArray(writer, state.optionalOutputs);

        // Write signer mappings
        writer.writeBoolean(state.addressRotationEnabled);
        this.writeSignerMappings(writer, state.signerMappings);

        // Write type-specific data
        this.writeTypeSpecificData(writer, state.typeSpecificData);

        // Write precomputed data
        this.writePrecomputedData(writer, state.precomputedData);

        // Get buffer and calculate checksum
        const dataBuffer = writer.getBuffer();
        const checksum = this.calculateChecksum(dataBuffer);

        // Concatenate data + checksum
        const result = new Uint8Array(dataBuffer.length + checksum.length);
        result.set(dataBuffer, 0);
        result.set(checksum, dataBuffer.length);
        return result;
    }

    /**
     * Deserialize binary format to transaction state
     * @param data - Uint8Array containing serialized state
     * @returns Deserialized transaction state
     * @throws Error if checksum validation fails or format is invalid
     */
    public static deserialize(data: Uint8Array): ISerializableTransactionState {
        // Verify checksum (last 32 bytes)
        if (data.length < 32) {
            throw new Error('Invalid serialized data: too short');
        }

        const checksum = data.subarray(-32);
        const payload = data.subarray(0, -32);
        const expectedChecksum = this.calculateChecksum(payload);

        if (!this.bytesEqual(checksum, expectedChecksum)) {
            throw new Error('Invalid checksum - data may be corrupted');
        }

        const reader = new BinaryReader(payload);

        // Read header
        const header = this.readHeader(reader);

        // Verify format version
        if (header.formatVersion > SERIALIZATION_FORMAT_VERSION) {
            throw new Error(`Unsupported format version: ${header.formatVersion}`);
        }

        // Read base params
        const baseParams = this.readBaseParams(reader);

        // Read UTXOs
        const utxos = this.readUTXOArray(reader);
        const optionalInputs = this.readUTXOArray(reader);

        // Read optional outputs
        const optionalOutputs = this.readOutputArray(reader);

        // Read signer mappings
        const addressRotationEnabled = reader.readBoolean();
        const signerMappings = this.readSignerMappings(reader);

        // Read type-specific data
        const typeSpecificData = this.readTypeSpecificData(reader, header.transactionType);

        // Read precomputed data
        const precomputedData = this.readPrecomputedData(reader);

        return {
            header,
            baseParams,
            utxos,
            optionalInputs,
            optionalOutputs,
            addressRotationEnabled,
            signerMappings,
            typeSpecificData,
            precomputedData,
        };
    }

    /**
     * Export state as base64 string (for transport)
     * @param state - Transaction state to export
     * @returns Base64-encoded string
     */
    public static toBase64(state: ISerializableTransactionState): string {
        const bytes = this.serialize(state);
        return this.uint8ArrayToBase64(bytes);
    }

    /**
     * Import state from base64 string
     * @param base64 - Base64-encoded state
     * @returns Deserialized transaction state
     */
    public static fromBase64(base64: string): ISerializableTransactionState {
        return this.deserialize(this.base64ToUint8Array(base64));
    }

    /**
     * Export state as hex string
     * @param state - Transaction state to export
     * @returns Hex-encoded string
     */
    public static toHex(state: ISerializableTransactionState): string {
        return toHex(this.serialize(state));
    }

    /**
     * Import state from hex string
     * @param hex - Hex-encoded state
     * @returns Deserialized transaction state
     */
    public static fromHex(hex: string): ISerializableTransactionState {
        return this.deserialize(fromHex(hex));
    }

    private static writeHeader(writer: BinaryWriter, header: SerializationHeader): void {
        writer.writeU8(SERIALIZATION_MAGIC_BYTE);
        writer.writeU8(header.formatVersion);
        writer.writeU8(header.consensusVersion);
        writer.writeU8(header.transactionType);
        writer.writeU32(header.chainId);
        writer.writeU64(BigInt(header.timestamp));
    }

    private static readHeader(reader: BinaryReader): SerializationHeader {
        const magic = reader.readU8();
        if (magic !== SERIALIZATION_MAGIC_BYTE) {
            throw new Error(
                `Invalid magic byte: expected 0x${SERIALIZATION_MAGIC_BYTE.toString(16)}, got 0x${magic.toString(16)}`,
            );
        }

        return {
            formatVersion: reader.readU8(),
            consensusVersion: reader.readU8(),
            transactionType: reader.readU8() as TransactionType,
            chainId: reader.readU32(),
            timestamp: Number(reader.readU64()),
        };
    }

    private static writeBaseParams(writer: BinaryWriter, params: SerializedBaseParams): void {
        writer.writeStringWithLength(params.from);
        writer.writeBoolean(params.to !== undefined);
        if (params.to !== undefined) {
            writer.writeStringWithLength(params.to);
        }
        writer.writeU32(Math.floor(params.feeRate * 1000)); // Store as milli-sat/vB for precision
        writer.writeU64(BigInt(params.priorityFee));
        writer.writeU64(BigInt(params.gasSatFee));
        writer.writeU8(this.networkNameToU8(params.networkName));
        writer.writeU8(params.txVersion);
        writer.writeBoolean(params.note !== undefined);
        if (params.note !== undefined) {
            writer.writeBytesWithLength(fromHex(params.note));
        }
        writer.writeBoolean(params.anchor);
        writer.writeBoolean(params.debugFees ?? false);
    }

    private static readBaseParams(reader: BinaryReader): SerializedBaseParams {
        const from = reader.readStringWithLength();
        const hasTo = reader.readBoolean();
        const to = hasTo ? reader.readStringWithLength() : undefined;
        const feeRate = reader.readU32() / 1000; // Convert back from milli-sat/vB
        const priorityFee = reader.readU64().toString();
        const gasSatFee = reader.readU64().toString();
        const networkName = this.u8ToNetworkName(reader.readU8());
        const txVersion = reader.readU8();
        const hasNote = reader.readBoolean();
        const note = hasNote ? toHex(reader.readBytesWithLength()) : undefined;
        const anchor = reader.readBoolean();
        const debugFees = reader.readBoolean();

        return {
            from,
            feeRate,
            priorityFee,
            gasSatFee,
            networkName,
            txVersion,
            anchor,
            debugFees,
            ...(to !== undefined ? { to } : {}),
            ...(note !== undefined ? { note } : {}),
        };
    }

    private static writeUTXOArray(writer: BinaryWriter, utxos: SerializedUTXO[]): void {
        writer.writeU16(utxos.length);
        for (const utxo of utxos) {
            this.writeUTXO(writer, utxo);
        }
    }

    private static writeUTXO(writer: BinaryWriter, utxo: SerializedUTXO): void {
        // Transaction ID (32 bytes)
        writer.writeBytes(fromHex(utxo.transactionId));
        writer.writeU32(utxo.outputIndex);
        writer.writeU64(BigInt(utxo.value));
        writer.writeBytesWithLength(fromHex(utxo.scriptPubKeyHex));

        // Optional address
        writer.writeBoolean(utxo.scriptPubKeyAddress !== undefined);
        if (utxo.scriptPubKeyAddress !== undefined) {
            writer.writeStringWithLength(utxo.scriptPubKeyAddress);
        }

        // Optional scripts
        writer.writeBoolean(utxo.redeemScript !== undefined);
        if (utxo.redeemScript !== undefined) {
            writer.writeBytesWithLength(fromHex(utxo.redeemScript));
        }

        writer.writeBoolean(utxo.witnessScript !== undefined);
        if (utxo.witnessScript !== undefined) {
            writer.writeBytesWithLength(fromHex(utxo.witnessScript));
        }

        writer.writeBoolean(utxo.nonWitnessUtxo !== undefined);
        if (utxo.nonWitnessUtxo !== undefined) {
            writer.writeBytesWithLength(fromHex(utxo.nonWitnessUtxo));
        }
    }

    private static readUTXOArray(reader: BinaryReader): SerializedUTXO[] {
        const count = reader.readU16();
        const utxos: SerializedUTXO[] = [];
        for (let i = 0; i < count; i++) {
            utxos.push(this.readUTXO(reader));
        }
        return utxos;
    }

    private static readUTXO(reader: BinaryReader): SerializedUTXO {
        const transactionId = toHex(reader.readBytes(32));
        const outputIndex = reader.readU32();
        const value = reader.readU64().toString();
        const scriptPubKeyHex = toHex(reader.readBytesWithLength());

        const hasAddress = reader.readBoolean();
        const scriptPubKeyAddress = hasAddress ? reader.readStringWithLength() : undefined;

        const hasRedeemScript = reader.readBoolean();
        const redeemScript = hasRedeemScript ? toHex(reader.readBytesWithLength()) : undefined;

        const hasWitnessScript = reader.readBoolean();
        const witnessScript = hasWitnessScript ? toHex(reader.readBytesWithLength()) : undefined;

        const hasNonWitnessUtxo = reader.readBoolean();
        const nonWitnessUtxo = hasNonWitnessUtxo ? toHex(reader.readBytesWithLength()) : undefined;

        return {
            transactionId,
            outputIndex,
            value,
            scriptPubKeyHex,
            ...(scriptPubKeyAddress !== undefined ? { scriptPubKeyAddress } : {}),
            ...(redeemScript !== undefined ? { redeemScript } : {}),
            ...(witnessScript !== undefined ? { witnessScript } : {}),
            ...(nonWitnessUtxo !== undefined ? { nonWitnessUtxo } : {}),
        };
    }

    private static writeOutputArray(writer: BinaryWriter, outputs: SerializedOutput[]): void {
        writer.writeU16(outputs.length);
        for (const output of outputs) {
            this.writeOutput(writer, output);
        }
    }

    private static writeOutput(writer: BinaryWriter, output: SerializedOutput): void {
        writer.writeU64(BigInt(output.value));

        writer.writeBoolean(output.address !== undefined);
        if (output.address !== undefined) {
            writer.writeStringWithLength(output.address);
        }

        writer.writeBoolean(output.script !== undefined);
        if (output.script !== undefined) {
            writer.writeBytesWithLength(fromHex(output.script));
        }

        writer.writeBoolean(output.tapInternalKey !== undefined);
        if (output.tapInternalKey !== undefined) {
            writer.writeBytesWithLength(fromHex(output.tapInternalKey));
        }
    }

    private static readOutputArray(reader: BinaryReader): SerializedOutput[] {
        const count = reader.readU16();
        const outputs: SerializedOutput[] = [];
        for (let i = 0; i < count; i++) {
            outputs.push(this.readOutput(reader));
        }
        return outputs;
    }

    private static readOutput(reader: BinaryReader): SerializedOutput {
        const value = Number(reader.readU64());

        const hasAddress = reader.readBoolean();
        const address = hasAddress ? reader.readStringWithLength() : undefined;

        const hasScript = reader.readBoolean();
        const script = hasScript ? toHex(reader.readBytesWithLength()) : undefined;

        const hasTapInternalKey = reader.readBoolean();
        const tapInternalKey = hasTapInternalKey ? toHex(reader.readBytesWithLength()) : undefined;

        return {
            value,
            ...(address !== undefined ? { address } : {}),
            ...(script !== undefined ? { script } : {}),
            ...(tapInternalKey !== undefined ? { tapInternalKey } : {}),
        };
    }

    private static writeSignerMappings(
        writer: BinaryWriter,
        mappings: SerializedSignerMapping[],
    ): void {
        writer.writeU16(mappings.length);
        for (const mapping of mappings) {
            writer.writeStringWithLength(mapping.address);
            writer.writeU16(mapping.inputIndices.length);
            for (const idx of mapping.inputIndices) {
                writer.writeU16(idx);
            }
        }
    }

    private static readSignerMappings(reader: BinaryReader): SerializedSignerMapping[] {
        const count = reader.readU16();
        const mappings: SerializedSignerMapping[] = [];
        for (let i = 0; i < count; i++) {
            const address = reader.readStringWithLength();
            const indicesCount = reader.readU16();
            const inputIndices: number[] = [];
            for (let j = 0; j < indicesCount; j++) {
                inputIndices.push(reader.readU16());
            }
            mappings.push({ address, inputIndices });
        }
        return mappings;
    }

    private static writeTypeSpecificData(writer: BinaryWriter, data: TypeSpecificData): void {
        switch (data.type) {
            case TransactionType.FUNDING:
                this.writeFundingData(writer, data);
                break;
            case TransactionType.DEPLOYMENT:
                this.writeDeploymentData(writer, data);
                break;
            case TransactionType.INTERACTION:
                this.writeInteractionData(writer, data);
                break;
            case TransactionType.MULTI_SIG:
                this.writeMultiSigData(writer, data);
                break;
            case TransactionType.CUSTOM_CODE:
                this.writeCustomScriptData(writer, data);
                break;
            case TransactionType.CANCEL:
                this.writeCancelData(writer, data);
                break;
            default:
                throw new Error(`Unsupported transaction type: ${(data as TypeSpecificData).type}`);
        }
    }

    private static readTypeSpecificData(
        reader: BinaryReader,
        type: TransactionType,
    ): TypeSpecificData {
        switch (type) {
            case TransactionType.FUNDING:
                return this.readFundingData(reader);
            case TransactionType.DEPLOYMENT:
                return this.readDeploymentData(reader);
            case TransactionType.INTERACTION:
                return this.readInteractionData(reader);
            case TransactionType.MULTI_SIG:
                return this.readMultiSigData(reader);
            case TransactionType.CUSTOM_CODE:
                return this.readCustomScriptData(reader);
            case TransactionType.CANCEL:
                return this.readCancelData(reader);
            default:
                throw new Error(`Unsupported transaction type: ${type}`);
        }
    }

    // Funding
    private static writeFundingData(writer: BinaryWriter, data: FundingSpecificData): void {
        writer.writeU64(BigInt(data.amount));
        writer.writeU16(data.splitInputsInto);
    }

    private static readFundingData(reader: BinaryReader): FundingSpecificData {
        return {
            type: TransactionType.FUNDING,
            amount: reader.readU64().toString(),
            splitInputsInto: reader.readU16(),
        };
    }

    // Deployment
    private static writeDeploymentData(writer: BinaryWriter, data: DeploymentSpecificData): void {
        writer.writeBytesWithLength(fromHex(data.bytecode));
        writer.writeBoolean(data.calldata !== undefined);
        if (data.calldata !== undefined) {
            writer.writeBytesWithLength(fromHex(data.calldata));
        }
        this.writeChallenge(writer, data.challenge);
        writer.writeBoolean(data.revealMLDSAPublicKey ?? false);
        writer.writeBoolean(data.linkMLDSAPublicKeyToAddress ?? false);
        writer.writeBoolean(data.hashedPublicKey !== undefined);
        if (data.hashedPublicKey !== undefined) {
            writer.writeBytesWithLength(fromHex(data.hashedPublicKey));
        }
    }

    private static readDeploymentData(reader: BinaryReader): DeploymentSpecificData {
        const bytecode = toHex(reader.readBytesWithLength());
        const hasCalldata = reader.readBoolean();
        const calldata = hasCalldata ? toHex(reader.readBytesWithLength()) : undefined;
        const challenge = this.readChallenge(reader);
        const revealMLDSAPublicKey = reader.readBoolean();
        const linkMLDSAPublicKeyToAddress = reader.readBoolean();
        const hasHashedPublicKey = reader.readBoolean();
        const hashedPublicKey = hasHashedPublicKey
            ? toHex(reader.readBytesWithLength())
            : undefined;

        return {
            type: TransactionType.DEPLOYMENT,
            bytecode,
            challenge,
            revealMLDSAPublicKey,
            linkMLDSAPublicKeyToAddress,
            ...(calldata !== undefined ? { calldata } : {}),
            ...(hashedPublicKey !== undefined ? { hashedPublicKey } : {}),
        };
    }

    // Interaction
    private static writeInteractionData(writer: BinaryWriter, data: InteractionSpecificData): void {
        writer.writeBytesWithLength(fromHex(data.calldata));
        writer.writeBoolean(data.contract !== undefined);
        if (data.contract !== undefined) {
            writer.writeStringWithLength(data.contract);
        }
        this.writeChallenge(writer, data.challenge);
        writer.writeBoolean(data.loadedStorage !== undefined);
        if (data.loadedStorage !== undefined) {
            this.writeLoadedStorage(writer, data.loadedStorage);
        }
        writer.writeBoolean(data.isCancellation ?? false);
        writer.writeBoolean(data.disableAutoRefund ?? false);
        writer.writeBoolean(data.revealMLDSAPublicKey ?? false);
        writer.writeBoolean(data.linkMLDSAPublicKeyToAddress ?? false);
        writer.writeBoolean(data.hashedPublicKey !== undefined);
        if (data.hashedPublicKey !== undefined) {
            writer.writeBytesWithLength(fromHex(data.hashedPublicKey));
        }
    }

    private static readInteractionData(reader: BinaryReader): InteractionSpecificData {
        const calldata = toHex(reader.readBytesWithLength());
        const hasContract = reader.readBoolean();
        const contract = hasContract ? reader.readStringWithLength() : undefined;
        const challenge = this.readChallenge(reader);
        const hasLoadedStorage = reader.readBoolean();
        const loadedStorage = hasLoadedStorage ? this.readLoadedStorage(reader) : undefined;
        const isCancellation = reader.readBoolean();
        const disableAutoRefund = reader.readBoolean();
        const revealMLDSAPublicKey = reader.readBoolean();
        const linkMLDSAPublicKeyToAddress = reader.readBoolean();
        const hasHashedPublicKey = reader.readBoolean();
        const hashedPublicKey = hasHashedPublicKey
            ? toHex(reader.readBytesWithLength())
            : undefined;

        return {
            type: TransactionType.INTERACTION,
            calldata,
            challenge,
            isCancellation,
            disableAutoRefund,
            revealMLDSAPublicKey,
            linkMLDSAPublicKeyToAddress,
            ...(contract !== undefined ? { contract } : {}),
            ...(loadedStorage !== undefined ? { loadedStorage } : {}),
            ...(hashedPublicKey !== undefined ? { hashedPublicKey } : {}),
        };
    }

    // MultiSig
    private static writeMultiSigData(writer: BinaryWriter, data: MultiSigSpecificData): void {
        writer.writeU16(data.pubkeys.length);
        for (const pubkey of data.pubkeys) {
            writer.writeBytesWithLength(fromHex(pubkey));
        }
        writer.writeU8(data.minimumSignatures);
        writer.writeStringWithLength(data.receiver);
        writer.writeU64(BigInt(data.requestedAmount));
        writer.writeStringWithLength(data.refundVault);
        writer.writeU16(data.originalInputCount);
        writer.writeBoolean(data.existingPsbtBase64 !== undefined);
        if (data.existingPsbtBase64 !== undefined) {
            writer.writeStringWithLength(data.existingPsbtBase64);
        }
    }

    private static readMultiSigData(reader: BinaryReader): MultiSigSpecificData {
        const pubkeysCount = reader.readU16();
        const pubkeys: string[] = [];
        for (let i = 0; i < pubkeysCount; i++) {
            pubkeys.push(toHex(reader.readBytesWithLength()));
        }
        const minimumSignatures = reader.readU8();
        const receiver = reader.readStringWithLength();
        const requestedAmount = reader.readU64().toString();
        const refundVault = reader.readStringWithLength();
        const originalInputCount = reader.readU16();
        const hasExistingPsbt = reader.readBoolean();
        const existingPsbtBase64 = hasExistingPsbt ? reader.readStringWithLength() : undefined;

        return {
            type: TransactionType.MULTI_SIG,
            pubkeys,
            minimumSignatures,
            receiver,
            requestedAmount,
            refundVault,
            originalInputCount,
            ...(existingPsbtBase64 !== undefined ? { existingPsbtBase64 } : {}),
        };
    }

    // Custom Script
    private static writeCustomScriptData(
        writer: BinaryWriter,
        data: CustomScriptSpecificData,
    ): void {
        writer.writeU16(data.scriptElements.length);
        for (const element of data.scriptElements) {
            this.writeScriptElement(writer, element);
        }
        writer.writeU16(data.witnesses.length);
        for (const witness of data.witnesses) {
            writer.writeBytesWithLength(fromHex(witness));
        }
        writer.writeBoolean(data.annex !== undefined);
        if (data.annex !== undefined) {
            writer.writeBytesWithLength(fromHex(data.annex));
        }
    }

    private static writeScriptElement(
        writer: BinaryWriter,
        element: SerializedScriptElement,
    ): void {
        writer.writeU8(element.elementType === 'buffer' ? 0 : 1);
        if (element.elementType === 'buffer') {
            writer.writeBytesWithLength(fromHex(element.value as string));
        } else {
            writer.writeU32(element.value as number);
        }
    }

    private static readCustomScriptData(reader: BinaryReader): CustomScriptSpecificData {
        const elementsCount = reader.readU16();
        const scriptElements: SerializedScriptElement[] = [];
        for (let i = 0; i < elementsCount; i++) {
            scriptElements.push(this.readScriptElement(reader));
        }
        const witnessesCount = reader.readU16();
        const witnesses: string[] = [];
        for (let i = 0; i < witnessesCount; i++) {
            witnesses.push(toHex(reader.readBytesWithLength()));
        }
        const hasAnnex = reader.readBoolean();
        const annex = hasAnnex ? toHex(reader.readBytesWithLength()) : undefined;

        return {
            type: TransactionType.CUSTOM_CODE,
            scriptElements,
            witnesses,
            ...(annex !== undefined ? { annex } : {}),
        };
    }

    private static readScriptElement(reader: BinaryReader): SerializedScriptElement {
        const typeFlag = reader.readU8();
        if (typeFlag === 0) {
            return {
                elementType: 'buffer',
                value: toHex(reader.readBytesWithLength()),
            };
        } else {
            return {
                elementType: 'opcode',
                value: reader.readU32(),
            };
        }
    }

    // Cancel
    private static writeCancelData(writer: BinaryWriter, data: CancelSpecificData): void {
        writer.writeBytesWithLength(fromHex(data.compiledTargetScript));
    }

    private static readCancelData(reader: BinaryReader): CancelSpecificData {
        return {
            type: TransactionType.CANCEL,
            compiledTargetScript: toHex(reader.readBytesWithLength()),
        };
    }

    private static writeChallenge(writer: BinaryWriter, challenge: RawChallenge): void {
        writer.writeU64(BigInt(challenge.epochNumber));
        writer.writeStringWithLength(challenge.mldsaPublicKey);
        writer.writeStringWithLength(challenge.legacyPublicKey);
        writer.writeBytesWithLength(fromHex(challenge.solution.replace('0x', '')));
        writer.writeBytesWithLength(fromHex(challenge.salt.replace('0x', '')));
        writer.writeBytesWithLength(fromHex(challenge.graffiti.replace('0x', '')));
        writer.writeU8(challenge.difficulty);

        // Verification
        this.writeChallengeVerification(writer, challenge.verification);

        // Optional submission
        writer.writeBoolean(challenge.submission !== undefined);
        if (challenge.submission !== undefined) {
            writer.writeStringWithLength(challenge.submission.mldsaPublicKey);
            writer.writeStringWithLength(challenge.submission.legacyPublicKey);
            writer.writeBytesWithLength(fromHex(challenge.submission.solution.replace('0x', '')));
            writer.writeBoolean(challenge.submission.graffiti !== undefined);
            if (challenge.submission.graffiti !== undefined) {
                writer.writeBytesWithLength(
                    fromHex(challenge.submission.graffiti.replace('0x', '')),
                );
            }
            writer.writeBytesWithLength(fromHex(challenge.submission.signature.replace('0x', '')));
        }
    }

    private static writeChallengeVerification(
        writer: BinaryWriter,
        verification: RawChallengeVerification,
    ): void {
        writer.writeBytesWithLength(fromHex(verification.epochHash.replace('0x', '')));
        writer.writeBytesWithLength(fromHex(verification.epochRoot.replace('0x', '')));
        writer.writeBytesWithLength(fromHex(verification.targetHash.replace('0x', '')));
        writer.writeBytesWithLength(fromHex(verification.targetChecksum.replace('0x', '')));
        writer.writeU64(BigInt(verification.startBlock));
        writer.writeU64(BigInt(verification.endBlock));
        writer.writeU16(verification.proofs.length);
        for (const proof of verification.proofs) {
            writer.writeBytesWithLength(fromHex(proof.replace('0x', '')));
        }
    }

    private static readChallenge(reader: BinaryReader): RawChallenge {
        const epochNumber = reader.readU64().toString();
        const mldsaPublicKey = reader.readStringWithLength();
        const legacyPublicKey = reader.readStringWithLength();
        const solution = '0x' + toHex(reader.readBytesWithLength());
        const salt = '0x' + toHex(reader.readBytesWithLength());
        const graffiti = '0x' + toHex(reader.readBytesWithLength());
        const difficulty = reader.readU8();

        const verification = this.readChallengeVerification(reader);

        const hasSubmission = reader.readBoolean();
        let submission;
        if (hasSubmission) {
            const subMldsaPublicKey = reader.readStringWithLength();
            const subLegacyPublicKey = reader.readStringWithLength();
            const subSolution = '0x' + toHex(reader.readBytesWithLength());
            const hasGraffiti = reader.readBoolean();
            const subGraffiti = hasGraffiti
                ? '0x' + toHex(reader.readBytesWithLength())
                : undefined;
            const subSignature = '0x' + toHex(reader.readBytesWithLength());

            submission = {
                mldsaPublicKey: subMldsaPublicKey,
                legacyPublicKey: subLegacyPublicKey,
                solution: subSolution,
                signature: subSignature,
                ...(subGraffiti !== undefined ? { graffiti: subGraffiti } : {}),
            };
        }

        return {
            epochNumber,
            mldsaPublicKey,
            legacyPublicKey,
            solution,
            salt,
            graffiti,
            difficulty,
            verification,
            ...(submission !== undefined ? { submission } : {}),
        };
    }

    private static readChallengeVerification(reader: BinaryReader): RawChallengeVerification {
        const epochHash = '0x' + toHex(reader.readBytesWithLength());
        const epochRoot = '0x' + toHex(reader.readBytesWithLength());
        const targetHash = '0x' + toHex(reader.readBytesWithLength());
        const targetChecksum = '0x' + toHex(reader.readBytesWithLength());
        const startBlock = reader.readU64().toString();
        const endBlock = reader.readU64().toString();
        const proofsCount = reader.readU16();
        const proofs: string[] = [];
        for (let i = 0; i < proofsCount; i++) {
            proofs.push('0x' + toHex(reader.readBytesWithLength()));
        }

        return {
            epochHash,
            epochRoot,
            targetHash,
            targetChecksum,
            startBlock,
            endBlock,
            proofs,
        };
    }

    private static writeLoadedStorage(
        writer: BinaryWriter,
        storage: SerializedLoadedStorage,
    ): void {
        const keys = Object.keys(storage);
        writer.writeU16(keys.length);
        for (const key of keys) {
            writer.writeStringWithLength(key);
            writer.writeStringArray(storage[key] as string[]);
        }
    }

    private static readLoadedStorage(reader: BinaryReader): SerializedLoadedStorage {
        const count = reader.readU16();
        const storage: SerializedLoadedStorage = {};
        for (let i = 0; i < count; i++) {
            const key = reader.readStringWithLength();
            storage[key] = reader.readStringArray();
        }
        return storage;
    }

    private static writePrecomputedData(writer: BinaryWriter, data: PrecomputedData): void {
        writer.writeBoolean(data.compiledTargetScript !== undefined);
        if (data.compiledTargetScript !== undefined) {
            writer.writeBytesWithLength(fromHex(data.compiledTargetScript));
        }

        writer.writeBoolean(data.randomBytes !== undefined);
        if (data.randomBytes !== undefined) {
            writer.writeBytesWithLength(fromHex(data.randomBytes));
        }

        writer.writeBoolean(data.estimatedFees !== undefined);
        if (data.estimatedFees !== undefined) {
            writer.writeU64(BigInt(data.estimatedFees));
        }

        writer.writeBoolean(data.contractSeed !== undefined);
        if (data.contractSeed !== undefined) {
            writer.writeStringWithLength(data.contractSeed);
        }

        writer.writeBoolean(data.contractAddress !== undefined);
        if (data.contractAddress !== undefined) {
            writer.writeStringWithLength(data.contractAddress);
        }
    }

    private static readPrecomputedData(reader: BinaryReader): PrecomputedData {
        const hasCompiledTargetScript = reader.readBoolean();
        const compiledTargetScript = hasCompiledTargetScript
            ? toHex(reader.readBytesWithLength())
            : undefined;

        const hasRandomBytes = reader.readBoolean();
        const randomBytes = hasRandomBytes ? toHex(reader.readBytesWithLength()) : undefined;

        const hasEstimatedFees = reader.readBoolean();
        const estimatedFees = hasEstimatedFees ? reader.readU64().toString() : undefined;

        const hasContractSeed = reader.readBoolean();
        const contractSeed = hasContractSeed ? reader.readStringWithLength() : undefined;

        const hasContractAddress = reader.readBoolean();
        const contractAddress = hasContractAddress ? reader.readStringWithLength() : undefined;

        return {
            ...(compiledTargetScript !== undefined ? { compiledTargetScript } : {}),
            ...(randomBytes !== undefined ? { randomBytes } : {}),
            ...(estimatedFees !== undefined ? { estimatedFees } : {}),
            ...(contractSeed !== undefined ? { contractSeed } : {}),
            ...(contractAddress !== undefined ? { contractAddress } : {}),
        };
    }

    /**
     * Calculate double SHA256 checksum (Bitcoin standard)
     */
    private static calculateChecksum(data: Uint8Array): Uint8Array {
        const hash1 = createHash('sha256').update(data).digest();
        return new Uint8Array(createHash('sha256').update(hash1).digest());
    }

    /**
     * Compare two Uint8Arrays for equality
     */
    private static bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * Encode Uint8Array to base64 string
     */
    private static uint8ArrayToBase64(bytes: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i] as number);
        }
        return btoa(binary);
    }

    /**
     * Decode base64 string to Uint8Array
     */
    private static base64ToUint8Array(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    private static networkNameToU8(name: 'mainnet' | 'testnet' | 'regtest'): number {
        switch (name) {
            case 'mainnet':
                return 0;
            case 'testnet':
                return 1;
            case 'regtest':
                return 2;
            default:
                throw new Error(`Unknown network: ${name}`);
        }
    }

    private static u8ToNetworkName(value: number): 'mainnet' | 'testnet' | 'regtest' {
        switch (value) {
            case 0:
                return 'mainnet';
            case 1:
                return 'testnet';
            case 2:
                return 'regtest';
            default:
                throw new Error(`Unknown network value: ${value}`);
        }
    }
}
