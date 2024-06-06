/// <reference types="node" />
import { Network } from 'bitcoinjs-lib';
export declare abstract class Generator {
    static readonly DATA_CHUNK_SIZE: number;
    static readonly MAGIC: Buffer;
    protected readonly senderPubKey: Buffer;
    protected readonly contractSaltPubKey: Buffer;
    protected readonly network: Network;
    protected constructor(senderPubKey: Buffer, contractSaltPubKey: Buffer, network?: Network);
    abstract compile(...args: unknown[]): Buffer;
    protected splitBufferIntoChunks(buffer: Buffer, chunkSize?: number): Array<Buffer[]>;
}
