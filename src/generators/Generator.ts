import {
    alloc,
    fromUtf8,
    Network,
    networks,
    PublicKey,
    toXOnly,
    XOnlyPublicKey,
} from '@btc-vision/bitcoin';
import { BinaryWriter } from '../buffer/BinaryWriter.js';
import {
    AccessListFeature,
    EpochSubmissionFeature,
    Feature,
    Features,
    MLDSALinkRequest,
} from './Features.js';
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
    public static readonly MAGIC: Uint8Array = fromUtf8('op');

    /**
     * The public key of the sender
     * @protected
     */
    protected readonly senderPubKey: Uint8Array;

    /**
     * The public key of the sender
     * @protected
     */
    protected readonly xSenderPubKey: Uint8Array;

    /**
     * The public key of the contract salt
     * @protected
     */
    protected readonly contractSaltPubKey?: Uint8Array;

    /**
     * The network to use
     * @protected
     */
    protected readonly network: Network = networks.bitcoin;

    protected constructor(
        senderPubKey: PublicKey | XOnlyPublicKey,
        contractSaltPubKey?: Uint8Array,
        network: Network = networks.bitcoin,
    ) {
        this.senderPubKey = senderPubKey;
        this.contractSaltPubKey = contractSaltPubKey;
        this.network = network;
        this.xSenderPubKey = toXOnly(senderPubKey);
    }

    public buildHeader(features: Features[]): Uint8Array {
        let flags: number = 0;

        for (const feature of features) {
            flags |= feature;
        }

        const bytesU24 = alloc(3);
        bytesU24[0] = (flags >> 16) & 0xff;
        bytesU24[1] = (flags >> 8) & 0xff;
        bytesU24[2] = flags & 0xff;

        return Uint8Array.from([this.senderPubKey[0], ...bytesU24]);
    }

    public getHeader(maxPriority: bigint, features: Features[] = []): Uint8Array {
        const writer = new BinaryWriter(12);
        writer.writeBytes(this.buildHeader(features));
        writer.writeU64(maxPriority);

        return new Uint8Array(writer.getBuffer());
    }

    /**
     * Compile the script
     * @param args - The arguments to use when compiling the script
     * @returns {Uint8Array} - The compiled script
     */
    public abstract compile(...args: unknown[]): Uint8Array;

    /**
     * Split a buffer into chunks
     * @param {Uint8Array} buffer - The buffer to split
     * @param {number} chunkSize - The size of each chunk
     * @protected
     * @returns {Array<Uint8Array[]>} - The chunks
     */
    protected splitBufferIntoChunks(
        buffer: Uint8Array,
        chunkSize: number = Generator.DATA_CHUNK_SIZE,
    ): Array<Uint8Array[]> {
        const chunks: Array<Uint8Array[]> = [];
        for (let i = 0; i < buffer.length; i += chunkSize) {
            const dataLength = Math.min(chunkSize, buffer.length - i);

            const buf2 = alloc(dataLength);
            for (let j = 0; j < dataLength; j++) {
                buf2[j] = buffer[i + j];
            }

            chunks.push([buf2]);
        }

        return chunks;
    }

    protected encodeFeature(feature: Feature<Features>, finalBuffer: BinaryWriter): void {
        switch (feature.opcode) {
            case Features.ACCESS_LIST: {
                return this.encodeAccessListFeature(feature as AccessListFeature, finalBuffer);
            }
            case Features.EPOCH_SUBMISSION: {
                return this.encodeChallengeSubmission(
                    feature as EpochSubmissionFeature,
                    finalBuffer,
                );
            }
            case Features.MLDSA_LINK_PUBKEY: {
                return this.encodeLinkRequest(feature as MLDSALinkRequest, finalBuffer);
            }
            default:
                throw new Error(`Unknown feature type: ${feature.opcode}`);
        }
    }

    private encodeAccessListFeature(feature: AccessListFeature, finalBuffer: BinaryWriter): void {
        const writer = new BinaryWriter();

        writer.writeU16(Object.keys(feature.data).length);

        for (const contract in feature.data) {
            const parsedContract = Address.fromString(contract);
            const data = feature.data[contract];

            writer.writeAddress(parsedContract);
            writer.writeU32(data.length);

            for (const pointer of data) {
                const pointerBuffer = Uint8Array.from(atob(pointer), (c) => c.charCodeAt(0));

                if (pointerBuffer.length !== 32) {
                    throw new Error(`Invalid pointer length: ${pointerBuffer.length}`);
                }

                writer.writeBytes(pointerBuffer);
            }
        }

        finalBuffer.writeBytesWithLength(Compressor.compress(new Uint8Array(writer.getBuffer())));
    }

    private encodeChallengeSubmission(
        feature: EpochSubmissionFeature,
        finalBuffer: BinaryWriter,
    ): void {
        if ('verifySignature' in feature.data && !feature.data.verifySignature()) {
            throw new Error('Invalid signature in challenge submission feature');
        }

        const writer = new BinaryWriter();
        writer.writeBytes(feature.data.publicKey.toBuffer());
        writer.writeBytes(feature.data.solution);

        if (feature.data.graffiti) {
            writer.writeBytesWithLength(feature.data.graffiti);
        }

        finalBuffer.writeBytesWithLength(writer.getBuffer());
    }

    private encodeLinkRequest(feature: MLDSALinkRequest, finalBuffer: BinaryWriter): void {
        const data = feature.data;

        const writer = new BinaryWriter();
        writer.writeU8(data.level);
        writer.writeBytes(data.hashedPublicKey);
        writer.writeBoolean(data.verifyRequest);

        if (data.verifyRequest) {
            if (!data.publicKey || !data.mldsaSignature) {
                throw new Error(
                    'MLDSA public key and signature required when verifyRequest is true',
                );
            }

            writer.writeBytes(data.publicKey);
            writer.writeBytes(data.mldsaSignature);
        }

        if (!data.legacySignature || data.legacySignature.length !== 64) {
            throw new Error('Legacy signature must be exactly 64 bytes');
        }

        writer.writeBytes(data.legacySignature);

        finalBuffer.writeBytesWithLength(writer.getBuffer());
    }
}
