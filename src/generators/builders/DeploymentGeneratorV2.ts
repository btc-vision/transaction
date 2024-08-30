import { crypto, Network, networks, opcodes, script } from 'bitcoinjs-lib';
import { Generator } from '../Generator.js';

export class DeploymentGeneratorV2 extends Generator {
    /**
     * The maximum size of a data chunk
     */
    public static readonly DATA_CHUNK_SIZE: number = 80;

    constructor(
        senderPubKey: Buffer,
        contractSaltPubKey: Buffer,
        network: Network = networks.bitcoin,
    ) {
        super(senderPubKey, contractSaltPubKey, network);
    }

    public compile(
        contractBytecode: Buffer,
        contractSalt: Buffer,
    ): { compiled: Buffer; chunks: Buffer[] } {
        const dataChunks = this.splitBufferIntoChunks(contractBytecode);
        const asm = this.getAsm(dataChunks, contractSalt);
        const compiled = script.compile(asm);

        /**
         * Verify that the script can be decompiled
         */
        const decompiled = script.decompile(compiled);
        if (!decompiled) {
            throw new Error('Failed to decompile script??');
        }

        return {
            compiled,
            chunks: dataChunks.flat(),
        };
    }

    /**
     * Split a buffer into chunks
     * @param {Buffer} buffer - The buffer to split
     * @param {number} chunkSize - The size of each chunk
     * @protected
     * @returns {Array<Buffer[]>} - The chunks
     */
    protected override splitBufferIntoChunks(
        buffer: Buffer,
        chunkSize: number = DeploymentGeneratorV2.DATA_CHUNK_SIZE,
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

    private getAsm(dataChunks: Buffer[][], contractSalt: Buffer): (number | Buffer)[] {
        const partA = [
            this.senderPubKey,
            opcodes.OP_CHECKSIGVERIFY,

            this.contractSaltPubKey,
            opcodes.OP_CHECKSIGVERIFY,

            opcodes.OP_HASH160,
            crypto.hash160(this.senderPubKey),
            opcodes.OP_EQUALVERIFY,

            opcodes.OP_HASH256,
            crypto.hash256(contractSalt),
            opcodes.OP_EQUALVERIFY,
        ];

        let i = 1;
        for (const chunk of dataChunks) {
            if (i % 80 === 0 && i !== 0) {
                partA.push(...[opcodes.OP_SHA1, crypto.sha1(chunk[0]), opcodes.OP_EQUALVERIFY]);
            }

            partA.push(...[opcodes.OP_TOALTSTACK]);

            i++;
        }

        //console.log(partA);

        partA.push(...[opcodes.OP_1]);

        return partA.flat();
    }
}
