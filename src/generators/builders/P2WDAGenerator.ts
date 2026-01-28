import { Network, networks } from '@btc-vision/bitcoin';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';
import { Feature, Features } from '../Features.js';
import { Generator } from '../Generator.js';
import { IChallengeSolution } from '../../epoch/interfaces/IChallengeSolution.js';

/**
 * @category Generators
 * @remarks Not fully implemented yet
 */
export class P2WDAGenerator extends Generator {
    private static readonly P2WDA_VERSION = 0x01;

    constructor(
        senderPubKey: Uint8Array,
        contractSaltPubKey: Uint8Array,
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
     * @param featuresRaw Optional features like access lists
     * @returns Raw operation data ready for signing and compression
     */
    public compile(
        calldata: Uint8Array,
        contractSecret: Uint8Array,
        challenge: IChallengeSolution,
        maxPriority: bigint,
        featuresRaw: Feature<Features>[] = [],
    ): Uint8Array {
        if (!this.contractSaltPubKey) {
            throw new Error('Contract salt public key not set');
        }

        if (contractSecret.length !== 32) {
            throw new Error('Contract secret must be exactly 32 bytes');
        }

        const writer = new BinaryWriter();

        writer.writeU8(P2WDAGenerator.P2WDA_VERSION);

        const features: Feature<Features>[] = featuresRaw.sort((a, b) => a.priority - b.priority);

        writer.writeBytes(
            this.getHeader(
                maxPriority,
                features.map((f) => f.opcode),
            ),
        );

        writer.writeBytes(contractSecret);

        writer.writeBytes(challenge.publicKey.toBuffer());
        writer.writeBytes(challenge.solution);

        writer.writeU32(calldata.length);
        writer.writeBytes(calldata);

        this.writeFeatures(writer, features);

        return new Uint8Array(writer.getBuffer());
    }

    public override getHeader(maxPriority: bigint, features: Features[] = []): Uint8Array {
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
        writer.writeU16(features.length);

        for (const feature of features) {
            writer.writeU8(feature.opcode);
            this.encodeFeature(feature, writer);
        }
    }
}
