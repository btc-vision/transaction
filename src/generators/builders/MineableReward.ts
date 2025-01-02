import { Network, networks, opcodes, script } from '@btc-vision/bitcoin';
import { Generator } from '../Generator.js';

/**
 * Class to generate bitcoin script for interaction transactions
 */
export class MineableReward extends Generator {
    constructor(senderPubKey: Buffer, network: Network = networks.bitcoin) {
        super(senderPubKey, Buffer.alloc(0), network);
    }

    /**
     * Compile an interaction bitcoin script
     * @param {Buffer} preimage1 - Preimage 1
     * @returns {Buffer} - The compiled script
     * @throws {Error} - If something goes wrong
     */
    public compile(preimage1: Buffer): Buffer {
        let compiledData: (number | Buffer)[];

        if (this.isTestnet()) {
            compiledData = [
                preimage1,
                opcodes.OP_SHA1,
                opcodes.OP_SHA1,
                opcodes.OP_SWAP,
                opcodes.OP_SHA1,
                opcodes.OP_SHA1,
                opcodes.OP_EQUAL,
            ];
        } else {
            compiledData = [
                preimage1,
                opcodes.OP_SWAP,
                opcodes.OP_2DUP,
                opcodes.OP_EQUAL,
                opcodes.OP_NOT,
                opcodes.OP_VERIFY,
                opcodes.OP_SHA1,
                opcodes.OP_SHA1,
                opcodes.OP_SWAP,
                opcodes.OP_SHA1,
                opcodes.OP_SHA1,
                opcodes.OP_EQUAL,
            ];
        }

        const asm = compiledData.flat();
        const compiled = script.compile(asm);

        /** Verify the validity of the script */
        const decompiled = script.decompile(compiled);
        if (!decompiled) {
            throw new Error('Failed to decompile script??');
        }

        return compiled;
    }

    private isTestnet(): boolean {
        return this.network === networks.testnet || this.network === networks.regtest;
    }
}
