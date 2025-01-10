import { crypto, Network, networks, opcodes, script } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { Compressor } from '../../bytecode/Compressor.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { FeatureOpCodes, Features } from '../Features.js';
import { Generator } from '../Generator.js';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';

/**
 * Class to generate bitcoin script for interaction transactions
 */
export class CalldataGenerator extends Generator {
    constructor(
        senderPubKey: Buffer,
        contractSaltPubKey: Buffer,
        network: Network = networks.bitcoin,
    ) {
        super(senderPubKey, contractSaltPubKey, network);
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
     * @param preimage
     * @param maxPriority - Amount of satoshis to spend max on priority fee
     * @param {number[]} [features=[]] - The features to use (optional)
     * @returns {Buffer} - The compiled script
     * @throws {Error} - If something goes wrong
     */
    public compile(
        calldata: Buffer,
        contractSecret: Buffer,
        preimage: Buffer,
        maxPriority: bigint,
        features: Features[] = [],
    ): Buffer {
        if (!this.contractSaltPubKey) throw new Error('Contract salt public key not set');

        const dataChunks: Buffer[][] = this.splitBufferIntoChunks(calldata);
        if (!dataChunks.length) throw new Error('No data chunks found');

        let compiledData = [
            this.getHeader(maxPriority),
            opcodes.OP_TOALTSTACK,

            // CHALLENGE PREIMAGE FOR REWARD,
            preimage,
            opcodes.OP_TOALTSTACK,

            this.xSenderPubKey,
            opcodes.OP_DUP,
            opcodes.OP_HASH256,
            crypto.hash256(this.xSenderPubKey),
            opcodes.OP_EQUALVERIFY,
            opcodes.OP_CHECKSIGVERIFY,

            this.contractSaltPubKey,
            opcodes.OP_CHECKSIGVERIFY,

            opcodes.OP_HASH160,
            crypto.hash160(contractSecret),
            opcodes.OP_EQUALVERIFY,

            opcodes.OP_DEPTH,
            opcodes.OP_1,
            opcodes.OP_NUMEQUAL,
            opcodes.OP_IF,

            Generator.MAGIC,
        ];

        const featureOpcodes = features.map((feature) => FeatureOpCodes[feature]); // Get the opcodes for the features

        // Write calldata
        compiledData = compiledData.concat(
            ...featureOpcodes,
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
