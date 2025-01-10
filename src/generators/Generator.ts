import { Network, networks, toXOnly } from '@btc-vision/bitcoin';
import { BinaryWriter } from '../buffer/BinaryWriter.js';

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

    public get senderFirstByte(): Buffer {
        return Buffer.from([this.senderPubKey[0], 0, 0, 0]);
    }

    public getHeader(maxPriority: bigint): Buffer {
        const writer = new BinaryWriter(8 + 4);
        writer.writeBytes(this.senderFirstByte);
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
}
