import { crypto, Network, networks, opcodes, script } from 'bitcoinjs-lib';
import { Generator } from '../Generator.js';

export class DeploymentGenerator extends Generator {
    constructor(
        senderPubKey: Buffer,
        contractSaltPubKey: Buffer,
        network: Network = networks.bitcoin,
    ) {
        super(senderPubKey, contractSaltPubKey, network);
    }

    /**
     * Compile a bitcoin script representing a contract deployment
     * @param {Buffer} contractBytecode - The contract bytecode
     * @param {Buffer} contractSalt - The contract salt
     * @returns {Buffer} - The compiled script
     */
    public compile(contractBytecode: Buffer, contractSalt: Buffer): Buffer {
        const dataChunks = this.splitBufferIntoChunks(contractBytecode);

        const asm = [
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

            opcodes.OP_DEPTH,
            opcodes.OP_1,
            opcodes.OP_NUMEQUAL,
            opcodes.OP_IF,

            Generator.MAGIC,
            opcodes.OP_1NEGATE,
            ...dataChunks,

            opcodes.OP_ELSE,
            opcodes.OP_1,
            opcodes.OP_ENDIF,
        ].flat();

        const compiled = script.compile(asm);

        /**
         * Verify that the script can be decompiled
         */
        const decompiled = script.decompile(compiled);
        if (!decompiled) {
            throw new Error('Failed to decompile script??');
        }

        return compiled;
    }
}
