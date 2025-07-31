import { Network, networks, toXOnly } from '@btc-vision/bitcoin';
import { BinaryWriter } from '../buffer/BinaryWriter.js';
import { AccessListFeature, EpochSubmissionFeature, Feature, Features } from './Features.js';
import { Address } from '../keypair/Address.js';
import { Compressor } from '../bytecode/Compressor.js';

/** Bitcoin Script Generator */
export abstract class Generator {
    /**
     * The maximum size of a data chunk
     */
    public static readonly DATA_CHUNK_SIZE: number = 512;

    /**
     * The magic number of OPNet
     */
    public static readonly MAGIC: Buffer = Buffer.from('op', 'utf-8');

    /**
     * The public key of the sender
     * @protected
     */
    protected readonly senderPubKey: Buffer;

    /**
     * The public key of the sender
     * @protected
     */
    protected readonly xSenderPubKey: Buffer;

    /**
     * The public key of the contract salt
     * @protected
     */
    protected readonly contractSaltPubKey?: Buffer;

    /**
     * The network to use
     * @protected
     */
    protected readonly network: Network = networks.bitcoin;

    protected constructor(
        senderPubKey: Buffer,
        contractSaltPubKey?: Buffer,
        network: Network = networks.bitcoin,
    ) {
        this.senderPubKey = senderPubKey;
        this.contractSaltPubKey = contractSaltPubKey;
        this.network = network;
        this.xSenderPubKey = toXOnly(senderPubKey);
    }

    public buildHeader(features: Features[]): Buffer {
        let flags: number = 0;

        for (const feature of features) {
            flags |= feature;
        }

        const bytesU24 = Buffer.alloc(3);
        bytesU24.writeUIntBE(flags, 0, 3);

        return Buffer.from([this.senderPubKey[0], ...bytesU24]);
    }

    public getHeader(maxPriority: bigint, features: Features[] = []): Buffer {
        const writer = new BinaryWriter(12);
        writer.writeBytes(this.buildHeader(features));
        writer.writeU64(maxPriority);

        return Buffer.from(writer.getBuffer());
    }

    /**
     * Compile the script
     * @param args - The arguments to use when compiling the script
     * @returns {Buffer} - The compiled script
     */
    public abstract compile(...args: unknown[]): Buffer;

    /**
     * Split a buffer into chunks
     * @param {Buffer} buffer - The buffer to split
     * @param {number} chunkSize - The size of each chunk
     * @protected
     * @returns {Array<Buffer[]>} - The chunks
     */
    protected splitBufferIntoChunks(
        buffer: Buffer,
        chunkSize: number = Generator.DATA_CHUNK_SIZE,
    ): Array<Buffer[]> {
        const chunks: Array<Buffer[]> = [];
        for (let i = 0; i < buffer.length; i += chunkSize) {
            const dataLength = Math.min(chunkSize, buffer.length - i);

            const buf2 = Buffer.alloc(dataLength);
            for (let j = 0; j < dataLength; j++) {
                buf2.writeUInt8(buffer[i + j], j);
            }

            chunks.push([buf2]);
        }

        return chunks;
    }

    protected encodeFeature(feature: Feature<Features>): Buffer[][] {
        switch (feature.opcode) {
            case Features.ACCESS_LIST: {
                return this.splitBufferIntoChunks(
                    this.encodeAccessListFeature(feature as AccessListFeature),
                );
            }
            case Features.EPOCH_SUBMISSION: {
                return this.splitBufferIntoChunks(
                    this.encodeChallengeSubmission(feature as EpochSubmissionFeature),
                );
            }
            default:
                throw new Error(`Unknown feature type: ${feature.opcode}`);
        }
    }

    private encodeAccessListFeature(feature: AccessListFeature): Buffer {
        const writer = new BinaryWriter();

        writer.writeU16(Object.keys(feature.data).length);

        for (const contract in feature.data) {
            const parsedContract = Address.fromString(contract);
            const data = feature.data[contract];

            writer.writeAddress(parsedContract);
            writer.writeU32(data.length);

            for (const pointer of data) {
                const pointerBuffer = Buffer.from(pointer, 'base64');

                if (pointerBuffer.length !== 32) {
                    throw new Error(`Invalid pointer length: ${pointerBuffer.length}`);
                }

                writer.writeBytes(pointerBuffer);
            }
        }

        return Compressor.compress(Buffer.from(writer.getBuffer()));
    }

    private encodeChallengeSubmission(feature: EpochSubmissionFeature): Buffer {
        if (!feature.data.verifySignature()) {
            throw new Error('Invalid signature in challenge submission feature');
        }

        const writer = new BinaryWriter();
        writer.writeBytes(feature.data.publicKey.originalPublicKeyBuffer());
        writer.writeBytes(feature.data.solution);

        if (feature.data.graffiti) {
            writer.writeBytesWithLength(feature.data.graffiti);
        }

        return Buffer.from(writer.getBuffer());
    }
}
