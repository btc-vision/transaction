import { crypto, Network, networks, opcodes, script } from '@btc-vision/bitcoin';
import { Generator } from '../Generator.js';
import { Feature, Features } from '../Features.js';
import { Preimage } from '../../epoch/IPreimage.js';

export const OPNET_DEPLOYMENT_VERSION = 0x00;
export const versionBuffer = Buffer.from([OPNET_DEPLOYMENT_VERSION]);

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
     * @param {Preimage} preimage - The preimage for reward
     * @param {bigint} maxPriority - The maximum priority for the contract
     * @param {Buffer} [calldata] - The calldata to be passed to the contract
     * @returns {Buffer} - The compiled script
     */
    public compile(
        contractBytecode: Buffer,
        contractSalt: Buffer,
        preimage: Preimage,
        maxPriority: bigint,
        calldata?: Buffer,
    ): Buffer {
        const asm = this.getAsm(contractBytecode, contractSalt, preimage, maxPriority, calldata);
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

    private getAsm(
        contractBytecode: Buffer,
        contractSalt: Buffer,
        preimage: Preimage,
        maxPriority: bigint,
        calldata?: Buffer,
        features?: Feature<Features>[],
    ): (number | Buffer)[] {
        if (!this.contractSaltPubKey) throw new Error('Contract salt public key not set');

        const dataChunks: Buffer[][] = this.splitBufferIntoChunks(contractBytecode);

        const calldataChunks: Buffer[][] = calldata ? this.splitBufferIntoChunks(calldata) : [];

        const featuresList: Features[] = [];
        const featureData: (number | Buffer | Buffer[])[] = [];

        if (features) {
            for (let i = 0; i < features.length; i++) {
                const feature = features[i];
                featuresList.push(feature.opcode);

                const data = this.encodeFeature(feature);
                featureData.push(...data);
            }
        }

        const compiledData = [
            this.getHeader(maxPriority, featuresList),
            opcodes.OP_TOALTSTACK,

            // CHALLENGE PREIMAGE FOR REWARD,
            preimage.solution,
            opcodes.OP_TOALTSTACK,

            this.xSenderPubKey,
            opcodes.OP_DUP,
            opcodes.OP_HASH256,
            crypto.hash256(this.xSenderPubKey),
            opcodes.OP_EQUALVERIFY,
            opcodes.OP_CHECKSIGVERIFY,

            this.contractSaltPubKey,
            opcodes.OP_CHECKSIGVERIFY,

            opcodes.OP_HASH256,
            crypto.hash256(contractSalt),
            opcodes.OP_EQUALVERIFY,

            opcodes.OP_DEPTH,
            opcodes.OP_1,
            opcodes.OP_NUMEQUAL,
            opcodes.OP_IF,

            Generator.MAGIC,
            ...featureData,
            opcodes.OP_0,
            ...calldataChunks,
            opcodes.OP_1NEGATE,
            ...dataChunks,

            opcodes.OP_ELSE,
            opcodes.OP_1,
            opcodes.OP_ENDIF,
        ];

        return compiledData.flat();
    }
}
