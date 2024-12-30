import { Network, networks, opcodes, script } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { Compressor } from '../../bytecode/Compressor.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { FeatureOpCodes, Features } from '../Features.js';
import { Generator } from '../Generator.js';

/**
 * Class to generate bitcoin script for interaction transactions
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
     * @param {number[]} [features=[]] - The features to use (optional)
     * @param {Buffer[]} [vaultPublicKeys=[]] - The public keys of the vault (optional)
     * @param {number} [minimumSignatures=0] - The minimum number of signatures (optional)
     * @returns {Buffer} - The compiled script
     * @throws {Error} - If something goes wrong
     */
    public compile(
        calldata: Buffer,
        contractSecret: Buffer,
        features: Features[] = [],
        vaultPublicKeys: Buffer[] = [],
        minimumSignatures: number = 0,
    ): Buffer {
        const dataChunks: Buffer[][] = this.splitBufferIntoChunks(calldata);
        if (!dataChunks.length) throw new Error('No data chunks found');

        let compiledData = [
            //this.senderPubKey,
            Buffer.from(
                '060373626d317ae8788ce3280b491068610d840c23ecb64c14075bbb9f670af52c6c4bc8c9ae26ed8f9831e3da372fbd26eaa48e9b788d1692b9d6f18393c58fc4',
                'hex',
            ),
            opcodes.OP_CHECKSIGVERIFY,

            contractSecret,
            opcodes.OP_TOALTSTACK,

            opcodes.OP_DEPTH,
            opcodes.OP_1,
            opcodes.OP_NUMEQUAL,
            opcodes.OP_IF,

            Generator.MAGIC,
        ];

        // write pub keys, when requested.
        if (vaultPublicKeys.length > 0) {
            const pubKeyBuffer = LegacyCalldataGenerator.getPubKeyAsBuffer(
                vaultPublicKeys,
                this.network,
            );
            const pubKeyDataChunks: Buffer[][] = this.splitBufferIntoChunks(pubKeyBuffer);

            compiledData = compiledData.concat(
                ...[
                    opcodes.OP_0, // provide opnet public keys
                    ...pubKeyDataChunks,
                ],
            );

            if (minimumSignatures) {
                // verify that the minimum is not greater than 255
                if (minimumSignatures > 255) {
                    throw new Error('Minimum signatures cannot exceed 255');
                }

                // we use a 2 bytes buffer even if we limit to 255 so it does not use an opcode for the number
                const minSigBuffer = Buffer.alloc(2);
                minSigBuffer.writeUint16LE(minimumSignatures, 0);

                compiledData = compiledData.concat(
                    ...[
                        opcodes.OP_1, // provide minimum signatures
                        minSigBuffer,
                    ],
                );
            } else {
                throw new Error('Minimum signatures must be provided');
            }
        }

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
