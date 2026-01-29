import { concat, crypto, Network, networks, opcodes, PublicKey, script } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
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
    constructor(senderPubKey: PublicKey, network: Network = networks.bitcoin) {
        super(senderPubKey, new Uint8Array(0), network);
    }

    /**
     * Get the public key as a buffer
     * @param {Uint8Array[]} witnessKeys - The public keys
     * @param {Network} network - The network to use
     * @private
     * @returns {Uint8Array} - The public key as a buffer
     */
    public static getPubKeyAsBuffer(witnessKeys: Uint8Array[], network: Network): Uint8Array {
        let finalBuffer: Uint8Array = new Uint8Array(0);

        for (const pubKey of witnessKeys) {
            const key: UniversalSigner = EcKeyPair.fromPublicKey(pubKey, network);

            if (!key.compressed) {
                throw new Error('Public key must be compressed');
            }

            if (pubKey.byteLength !== 33) {
                throw new Error(`Public key must be 33 bytes, got ${pubKey.byteLength} bytes.`);
            }

            finalBuffer = concat([finalBuffer, pubKey]);
        }

        // compress the public keys
        const compressed: Uint8Array = Compressor.compress(finalBuffer);
        if (compressed.byteLength >= finalBuffer.byteLength) {
            // we ensure that the user pays the smallest amount of fees. [micro-optimization]
            return finalBuffer;
        }

        // if compressed is smaller, return compressed.
        return compressed;
    }

    /**
     * Compile an interaction bitcoin script
     * @param {Uint8Array} calldata - The calldata to use
     * @param {Uint8Array} contractSecret - The contract secret
     * @param {Uint8Array} challenge - The challenge to use
     * @param {bigint} maxPriority - The maximum priority
     * @param {number[]} [featuresRaw=[]] - The features to use (optional)
     * @returns {Uint8Array} - The compiled script
     * @throws {Error} - If something goes wrong
     */
    public compile(
        calldata: Uint8Array,
        contractSecret: Uint8Array,
        challenge: Uint8Array,
        maxPriority: bigint,
        featuresRaw: Feature<Features>[] = [],
    ): Uint8Array {
        const dataChunks: Uint8Array[][] = this.splitBufferIntoChunks(calldata);
        if (!dataChunks.length) throw new Error('No data chunks found');

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

            featureData.push(...this.splitBufferIntoChunks(new Uint8Array(finalBuffer.getBuffer())));
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
