import { crypto, Network, networks, opcodes, script } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { Compressor } from '../../bytecode/Compressor.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { Generator } from '../Generator.js';
import { Feature, Features } from '../Features.js';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';

/**
 * Class to generate bitcoin script for interaction transactions
 * @deprecated
 */
export class LegacyCalldataGenerator extends Generator {
    constructor(senderPubKey: Buffer, network: Network = networks.bitcoin) {
        super(senderPubKey, Buffer.alloc(0), network);
    }

    /**
     * Get the public key as a buffer
     * @param {Buffer[]} witnessKeys - The public keys
     * @param {Network} network - The network to use
     * @private
     * @returns {Buffer} - The public key as a buffer
     */
    public static getPubKeyAsBuffer(witnessKeys: Buffer[], network: Network): Buffer {
        let finalBuffer: Buffer = Buffer.alloc(0);

        for (const pubKey of witnessKeys) {
            const key: ECPairInterface = EcKeyPair.fromPublicKey(pubKey, network);

            if (!key.compressed) {
                throw new Error('Public key must be compressed');
            }

            if (pubKey.byteLength !== 33) {
                throw new Error(`Public key must be 33 bytes, got ${pubKey.byteLength} bytes.`);
            }

            finalBuffer = Buffer.concat([finalBuffer, pubKey]);
        }

        // compress the public keys
        const compressed: Buffer = Compressor.compress(finalBuffer);
        if (compressed.byteLength >= finalBuffer.byteLength) {
            // we ensure that the user pays the smallest amount of fees. [micro-optimization]
            return finalBuffer;
        }

        // if compressed is smaller, return compressed.
        return compressed;
    }

    /**
     * Compile an interaction bitcoin script
     * @param {Buffer} calldata - The calldata to use
     * @param {Buffer} contractSecret - The contract secret
     * @param {Buffer} challenge - The challenge to use
     * @param {bigint} maxPriority - The maximum priority
     * @param {number[]} [featuresRaw=[]] - The features to use (optional)
     * @returns {Buffer} - The compiled script
     * @throws {Error} - If something goes wrong
     */
    public compile(
        calldata: Buffer,
        contractSecret: Buffer,
        challenge: Buffer,
        maxPriority: bigint,
        featuresRaw: Feature<Features>[] = [],
    ): Buffer {
        const dataChunks: Buffer[][] = this.splitBufferIntoChunks(calldata);
        if (!dataChunks.length) throw new Error('No data chunks found');

        const featuresList: Features[] = [];
        const featureData: (number | Buffer | Buffer[])[] = [];

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

            featureData.push(...this.splitBufferIntoChunks(Buffer.from(finalBuffer.getBuffer())));
        }

        let compiledData = [
            this.getHeader(maxPriority, featuresList),
            opcodes.OP_TOALTSTACK,

            // CHALLENGE PREIMAGE FOR REWARD,
            challenge,
            opcodes.OP_TOALTSTACK,

            this.senderPubKey,
            opcodes.OP_DUP,
            opcodes.OP_HASH256,
            crypto.hash256(this.senderPubKey),
            opcodes.OP_EQUALVERIFY,
            opcodes.OP_CHECKSIGVERIFY,

            contractSecret,
            opcodes.OP_TOALTSTACK,

            opcodes.OP_DEPTH,
            opcodes.OP_1,
            opcodes.OP_NUMEQUAL,
            opcodes.OP_IF,

            Generator.MAGIC,
        ];

        // Write calldata
        compiledData = compiledData.concat(
            ...featureData,
            ...[opcodes.OP_1NEGATE, ...dataChunks, opcodes.OP_ELSE, opcodes.OP_1, opcodes.OP_ENDIF],
        );

        const asm = compiledData.flat();
        const compiled = script.compile(asm);

        /** Verify the validity of the script */
        const decompiled = script.decompile(compiled);
        if (!decompiled) {
            throw new Error('Failed to decompile script??');
        }

        return compiled;
    }
}
