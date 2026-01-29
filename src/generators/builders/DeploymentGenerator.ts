import { crypto, Network, networks, opcodes, PublicKey, script } from '@btc-vision/bitcoin';
import { Generator } from '../Generator.js';
import { Feature, Features } from '../Features.js';
import { IChallengeSolution } from '../../epoch/interfaces/IChallengeSolution.js';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';

export const OPNET_DEPLOYMENT_VERSION = 0x00;
export const versionBuffer = Uint8Array.from([OPNET_DEPLOYMENT_VERSION]);

export class DeploymentGenerator extends Generator {
    constructor(
        senderPubKey: PublicKey,
        contractSaltPubKey: Uint8Array,
        network: Network = networks.bitcoin,
    ) {
        super(senderPubKey, contractSaltPubKey, network);
    }

    /**
     * Compile a bitcoin script representing a contract deployment
     * @param {Uint8Array} contractBytecode - The contract bytecode
     * @param {Uint8Array} contractSalt - The contract salt
     * @param {ChallengeSolution} challenge - The challenge for reward
     * @param {bigint} maxPriority - The maximum priority for the contract
     * @param {Uint8Array} [calldata] - The calldata to be passed to the contract
     * @param {Feature<Features>[]} [features] - Optional features to include in the script
     * @returns {Uint8Array} - The compiled script
     */
    public compile(
        contractBytecode: Uint8Array,
        contractSalt: Uint8Array,
        challenge: IChallengeSolution,
        maxPriority: bigint,
        calldata?: Uint8Array,
        features?: Feature<Features>[],
    ): Uint8Array {
        const asm = this.getAsm(
            contractBytecode,
            contractSalt,
            challenge,
            maxPriority,
            calldata,
            features,
        );

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
        contractBytecode: Uint8Array,
        contractSalt: Uint8Array,
        challenge: IChallengeSolution,
        maxPriority: bigint,
        calldata?: Uint8Array,
        featuresRaw?: Feature<Features>[],
    ): (number | Uint8Array)[] {
        if (!this.contractSaltPubKey) throw new Error('Contract salt public key not set');

        const dataChunks: Uint8Array[][] = this.splitBufferIntoChunks(contractBytecode);
        const calldataChunks: Uint8Array[][] = calldata ? this.splitBufferIntoChunks(calldata) : [];

        const featuresList: Features[] = [];
        const featureData: (number | Uint8Array | Uint8Array[])[] = [];

        if (featuresRaw && featuresRaw.length) {
            const features: Feature<Features>[] = featuresRaw.sort(
                (a, b) => a.priority - b.priority,
            );

            const finalBuffer = new BinaryWriter();
            for (let i = 0; i < features.length; i++) {
                const feature = features[i];
                featuresList.push(feature.opcode);

                this.encodeFeature(feature, finalBuffer);
            }

            featureData.push(
                ...this.splitBufferIntoChunks(new Uint8Array(finalBuffer.getBuffer())),
            );
        }

        const compiledData = [
            this.getHeader(maxPriority, featuresList),
            opcodes.OP_TOALTSTACK,

            // CHALLENGE PREIMAGE FOR REWARD,
            challenge.publicKey.toBuffer(),
            opcodes.OP_TOALTSTACK,

            challenge.solution,
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
