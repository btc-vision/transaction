import { Network, networks } from '@btc-vision/bitcoin';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';
import { Feature, Features } from '../Features.js';
import { Generator } from '../Generator.js';
import { ChallengeSolution } from '../../epoch/ChallengeSolution.js';

export class P2WDAGenerator extends Generator {
    private static readonly P2WDA_VERSION = 0x01;

    constructor(
        senderPubKey: Buffer,
        contractSaltPubKey: Buffer,
        network: Network = networks.bitcoin,
    ) {
        super(senderPubKey, contractSaltPubKey, network);
    }

    /**
     * Validate that operation data will fit in P2WDA witness fields
     *
     * @param dataSize Size of the operation data
     * @param maxWitnessFields Maximum number of witness fields (default 10)
     * @param maxBytesPerWitness Maximum bytes per witness field (default 80)
     * @returns true if data will fit, false otherwise
     */
    public static validateWitnessSize(
        dataSize: number,
        maxWitnessFields: number = 10,
        maxBytesPerWitness: number = 80,
    ): boolean {
        // Account for Schnorr signature (64 bytes) and compression
        // Assume 30% compression ratio (conservative estimate)

        const signatureSize = 64;
        const compressionRatio = 0.7;

        const totalSize = dataSize + signatureSize;
        const compressedSize = Math.ceil(totalSize * compressionRatio);

        const requiredFields = Math.ceil(compressedSize / maxBytesPerWitness);

        return requiredFields <= maxWitnessFields;
    }

    /**
     * Compile operation data for P2WDA witness embedding
     *
     * This creates a binary structure containing all operation information
     * without Bitcoin script opcodes. The structure is:
     *
     * [version(1)] [header(12)] [contract(32)] [challenge_pubkey(33)] [challenge_solution(32)]
     * [calldata_length(4)] [calldata] [features_length(2)] [features_data]
     *
     * @param calldata The compressed calldata for the contract interaction
     * @param contractSecret The 32-byte contract secret
     * @param challenge The challenge solution for epoch rewards
     * @param maxPriority Maximum priority fee in satoshis
     * @param features Optional features like access lists
     * @returns Raw operation data ready for signing and compression
     */
    public compile(
        calldata: Buffer,
        contractSecret: Buffer,
        challenge: ChallengeSolution,
        maxPriority: bigint,
        features: Feature<Features>[] = [],
    ): Buffer {
        if (!this.contractSaltPubKey) {
            throw new Error('Contract salt public key not set');
        }

        if (contractSecret.length !== 32) {
            throw new Error('Contract secret must be exactly 32 bytes');
        }

        const writer = new BinaryWriter();

        // Version byte
        writer.writeU8(P2WDAGenerator.P2WDA_VERSION);

        // Header
        writer.writeBytes(
            this.getHeader(
                maxPriority,
                features.map((f) => f.opcode),
            ),
        );

        // Contract secret
        writer.writeBytes(contractSecret);

        // Challenge components for epoch rewards
        writer.writeBytes(challenge.publicKey.originalPublicKeyBuffer());
        writer.writeBytes(challenge.solution);

        // Calldata with length prefix
        writer.writeU32(calldata.length);
        writer.writeBytes(calldata);

        // Features
        this.writeFeatures(writer, features);

        return Buffer.from(writer.getBuffer());
    }

    /**
     * Create a minimal header for P2WDA operations
     *
     * The header contains essential transaction metadata in a compact format:
     * [sender_pubkey_prefix(1)] [feature_flags(3)] [max_priority(8)]
     *
     * @param maxPriority Maximum priority fee
     * @param features Feature opcodes to set in flags
     * @returns 12-byte header
     */
    public override getHeader(maxPriority: bigint, features: Features[] = []): Buffer {
        return super.getHeader(maxPriority, features);
    }

    /**
     * Write features section to the operation data
     *
     * Features are encoded as:
     * [feature_count(2)] [feature1_opcode(1)] [feature1_length(4)] [feature1_data] ...
     *
     * @param writer Binary writer to write to
     * @param features Array of features to encode
     */
    private writeFeatures(writer: BinaryWriter, features: Feature<Features>[]): void {
        // Write feature count
        writer.writeU16(features.length);

        for (const feature of features) {
            // Write feature opcode
            writer.writeU8(feature.opcode);

            // Encode feature data
            const encodedData = this.encodeFeatureData(feature);

            // Write feature data with length prefix
            writer.writeU32(encodedData.length);
            writer.writeBytes(encodedData);
        }
    }

    /**
     * Encode a single feature's data
     *
     * Unlike the base Generator class, we don't split into chunks here
     * since P2WDA handles chunking at the witness level
     *
     * @param feature The feature to encode
     * @returns Encoded feature data
     */
    private encodeFeatureData(feature: Feature<Features>): Buffer {
        switch (feature.opcode) {
            case Features.ACCESS_LIST: {
                // Access lists are already encoded efficiently by the parent class
                const chunks = this.encodeFeature(feature);
                // Flatten chunks since P2WDA doesn't need script-level chunking
                return Buffer.concat(chunks.flat());
            }

            case Features.EPOCH_SUBMISSION: {
                // Epoch submissions are also handled by parent
                const chunks = this.encodeFeature(feature);
                return Buffer.concat(chunks.flat());
            }

            default:
                throw new Error(`Unknown feature type: ${feature.opcode}`);
        }
    }
}
