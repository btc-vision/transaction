import { crypto, equals, Network, networks, opcodes, payments, Script, script, } from '@btc-vision/bitcoin';
import { IHashCommittedP2WSH } from '../../transaction/interfaces/IConsolidatedTransactionParameters.js';
import { IP2WSHAddress } from '../../transaction/mineable/IP2WSHAddress.js';
import { Logger } from '@btc-vision/logger';

/**
 * Generates hash-committed P2WSH addresses for the Consolidated Hash-Committed Transaction (CHCT) system.
 *
 * These P2WSH scripts enforce that specific data must be provided in the witness to spend the output.
 * If data is stripped or modified, the transaction fails at Bitcoin consensus level.
 *
 * Witness Script Structure (58 bytes):
 * OP_HASH160 <20-byte-hash> OP_EQUALVERIFY <33-byte-pubkey> OP_CHECKSIG
 *
 * Witness Stack (when spending):
 * [signature, data_chunk, witnessScript]
 */
export class HashCommitmentGenerator extends Logger {
    /**
     * Maximum chunk size per Bitcoin P2WSH stack item limit.
     * See policy.h: MAX_STANDARD_P2WSH_STACK_ITEM_SIZE = 80
     */
    public static readonly MAX_CHUNK_SIZE: number = 80;
    /**
     * Maximum stack items per P2WSH input.
     * See policy.h: MAX_STANDARD_P2WSH_STACK_ITEMS = 100
     */
    public static readonly MAX_STACK_ITEMS: number = 100;
    /**
     * Maximum total witness size (serialized).
     * See policy.cpp: GetSerializeSize(tx.vin[i].scriptWitness.stack) > g_script_size_policy_limit
     * Default: 1650 bytes
     */
    public static readonly MAX_WITNESS_SIZE: number = 1650;

    /** Maximum weight per standard transaction */
    public static readonly MAX_STANDARD_WEIGHT: number = 400000;
    /** Minimum satoshis per output (dust limit) */
    public static readonly MIN_OUTPUT_VALUE: bigint = 330n;
    /**
     * Bytes per hash commitment in witness script.
     * OP_HASH160 (1) + push (1) + hash (20) + OP_EQUALVERIFY (1) = 23 bytes
     */
    private static readonly BYTES_PER_COMMITMENT: number = 23;
    /**
     * Signature check bytes in witness script.
     * push (1) + pubkey (33) + OP_CHECKSIG (1) = 35 bytes
     */
    private static readonly SIG_CHECK_BYTES: number = 35;
    /**
     * Fixed overhead in witness serialization:
     * - Stack item count: 1 byte
     * - Signature: 73 bytes (72 + 1 length prefix)
     * - Script length prefix: 3 bytes (varInt for sizes 253-65535)
     * - Script base (pubkey + checksig): 35 bytes
     */
    private static readonly WITNESS_FIXED_OVERHEAD: number = 1 + 73 + 3 + 35;
    /**
     * Per-chunk overhead in witness:
     * - Data: 81 bytes (80 + 1 length prefix)
     * - Script commitment: 23 bytes
     * Total: 104 bytes per chunk
     */
    private static readonly WITNESS_PER_CHUNK_OVERHEAD: number =
        HashCommitmentGenerator.MAX_CHUNK_SIZE + 1 + HashCommitmentGenerator.BYTES_PER_COMMITMENT;
    /**
     * Maximum data chunks per P2WSH output.
     * Limited by total witness size: (1650 - 112) / 104 = 14 chunks
     */
    public static readonly MAX_CHUNKS_PER_OUTPUT: number = Math.floor(
        (HashCommitmentGenerator.MAX_WITNESS_SIZE -
            HashCommitmentGenerator.WITNESS_FIXED_OVERHEAD) /
            HashCommitmentGenerator.WITNESS_PER_CHUNK_OVERHEAD,
    );
    /** Base weight per input (non-witness): 41 bytes * 4 = 164 */
    private static readonly INPUT_BASE_WEIGHT: number = 164;

    /**
     * Witness weight per input with max chunks:
     * Total witness size is ~1566 bytes (under 1650 limit)
     * Witness bytes count as 1 weight unit each.
     */
    private static readonly INPUT_WITNESS_WEIGHT_MAX: number =
        HashCommitmentGenerator.MAX_WITNESS_SIZE; // Use max as upper bound

    /** Total weight per input (with max chunks) */
    public static readonly WEIGHT_PER_INPUT: number =
        HashCommitmentGenerator.INPUT_BASE_WEIGHT +
        HashCommitmentGenerator.INPUT_WITNESS_WEIGHT_MAX;
    public readonly logColor: string = '#4a90d9';
    private readonly publicKey: Uint8Array;
    private readonly network: Network;

    constructor(publicKey: Uint8Array, network: Network = networks.bitcoin) {
        super();

        if (publicKey.length !== 33) {
            throw new Error('Public key must be 33 bytes (compressed)');
        }

        this.publicKey = publicKey;
        this.network = network;
    }

    /**
     * Calculate the maximum number of inputs per standard reveal transaction.
     *
     * Standard tx weight limit: 400,000
     * With max chunks per input (~10,385 weight), only ~38 inputs fit
     *
     * @returns Maximum inputs per reveal tx (~38 with max chunks)
     */
    public static calculateMaxInputsPerTx(): number {
        const txOverhead = 40; // version, locktime, input/output counts
        const outputOverhead = 200; // typical outputs (contract, change)
        const availableWeight =
            HashCommitmentGenerator.MAX_STANDARD_WEIGHT - txOverhead - outputOverhead;

        return Math.floor(availableWeight / HashCommitmentGenerator.WEIGHT_PER_INPUT);
    }

    /**
     * Calculate maximum data per standard reveal transaction.
     *
     * @returns Maximum data in bytes (~300KB with batched chunks at 70 chunks/output)
     */
    public static calculateMaxDataPerTx(): number {
        return (
            HashCommitmentGenerator.calculateMaxInputsPerTx() *
            HashCommitmentGenerator.MAX_CHUNKS_PER_OUTPUT *
            HashCommitmentGenerator.MAX_CHUNK_SIZE
        );
    }

    /**
     * Estimate the number of P2WSH outputs needed for a given data size.
     *
     * @param dataSize Data size in bytes
     * @returns Number of P2WSH outputs needed
     */
    public static estimateOutputCount(dataSize: number): number {
        return Math.ceil(
            dataSize /
                (HashCommitmentGenerator.MAX_CHUNKS_PER_OUTPUT *
                    HashCommitmentGenerator.MAX_CHUNK_SIZE),
        );
    }

    /**
     * Estimate the number of 80-byte chunks for a given data size.
     *
     * @param dataSize Data size in bytes
     * @returns Number of 80-byte chunks needed
     */
    public static estimateChunkCount(dataSize: number): number {
        return Math.ceil(dataSize / HashCommitmentGenerator.MAX_CHUNK_SIZE);
    }

    /**
     * Validate that a witness script is a valid multi-hash committed script.
     *
     * Script structure: (OP_HASH160 <hash> OP_EQUALVERIFY)+ <pubkey> OP_CHECKSIG
     *
     * @param witnessScript The witness script to validate
     * @returns true if valid hash-committed script
     */
    public static validateHashCommittedScript(witnessScript: Uint8Array): boolean {
        try {
            const decompiled = script.decompile(witnessScript);
            if (!decompiled || decompiled.length < 5) {
                return false;
            }

            // Last two elements must be pubkey and OP_CHECKSIG
            const lastIdx = decompiled.length - 1;
            if (decompiled[lastIdx] !== opcodes.OP_CHECKSIG) {
                return false;
            }
            const pubkey = decompiled[lastIdx - 1];
            if (!(pubkey instanceof Uint8Array) || pubkey.length !== 33) {
                return false;
            }

            // Everything before must be (OP_HASH160 <hash> OP_EQUALVERIFY) triplets
            const hashParts = decompiled.slice(0, -2);
            if (hashParts.length % 3 !== 0 || hashParts.length === 0) {
                return false;
            }

            for (let i = 0; i < hashParts.length; i += 3) {
                const hash = hashParts[i + 1];
                if (
                    hashParts[i] !== opcodes.OP_HASH160 ||
                    !(hash instanceof Uint8Array) ||
                    hash.length !== 20 ||
                    hashParts[i + 2] !== opcodes.OP_EQUALVERIFY
                ) {
                    return false;
                }
            }

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Extract all data hashes from a hash-committed witness script.
     *
     * @param witnessScript The witness script
     * @returns Array of 20-byte data hashes (in data order), or null if invalid
     */
    public static extractDataHashes(witnessScript: Uint8Array): Uint8Array[] | null {
        try {
            const decompiled = script.decompile(witnessScript);
            if (
                !decompiled ||
                !HashCommitmentGenerator.validateHashCommittedScript(witnessScript)
            ) {
                return null;
            }

            // Extract hashes from triplets (they're in reverse order in script)
            const hashParts = decompiled.slice(0, -2);
            const hashes: Uint8Array[] = [];

            for (let i = 0; i < hashParts.length; i += 3) {
                hashes.push(hashParts[i + 1] as Uint8Array);
            }

            // Reverse to get data order (script has them reversed)
            return hashes.reverse();
        } catch {
            return null;
        }
    }

    /**
     * Extract the public key from a hash-committed witness script.
     *
     * @param witnessScript The witness script
     * @returns The 33-byte public key, or null if invalid script
     */
    public static extractPublicKey(witnessScript: Uint8Array): Uint8Array | null {
        try {
            const decompiled = script.decompile(witnessScript);
            if (
                !decompiled ||
                !HashCommitmentGenerator.validateHashCommittedScript(witnessScript)
            ) {
                return null;
            }
            return decompiled[decompiled.length - 2] as Uint8Array;
        } catch {
            return null;
        }
    }

    /**
     * Verify that data chunks match their committed hashes.
     *
     * @param dataChunks Array of data chunks (in order)
     * @param witnessScript The witness script containing the hash commitments
     * @returns true if all chunks match their commitments
     */
    public static verifyChunkCommitments(
        dataChunks: Uint8Array[],
        witnessScript: Uint8Array,
    ): boolean {
        const committedHashes = HashCommitmentGenerator.extractDataHashes(witnessScript);
        if (!committedHashes || committedHashes.length !== dataChunks.length) {
            return false;
        }

        for (let i = 0; i < dataChunks.length; i++) {
            const actualHash = crypto.hash160(dataChunks[i]);
            if (!equals(committedHashes[i], actualHash)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Estimate fees for a complete CHCT flow (setup + reveal).
     *
     * @param dataSize Data size in bytes (before compression)
     * @param feeRate Fee rate in sat/vB
     * @param compressionRatio Expected compression ratio (default: 0.7)
     * @returns Fee estimates
     */
    public static estimateFees(
        dataSize: number,
        feeRate: number,
        compressionRatio: number = 0.7,
    ): {
        compressedSize: number;
        outputCount: number;
        chunkCount: number;
        setupVBytes: number;
        revealVBytes: number;
        setupFee: bigint;
        revealFee: bigint;
        totalFee: bigint;
        outputsValue: bigint;
        totalCost: bigint;
    } {
        const compressedSize = Math.ceil(dataSize * compressionRatio);
        const outputCount = HashCommitmentGenerator.estimateOutputCount(compressedSize);
        const chunkCount = HashCommitmentGenerator.estimateChunkCount(compressedSize);

        // Setup tx: inputs (funding) + outputs (P2WSH commitments + change)
        // Estimate: 2 P2TR inputs + N P2WSH outputs + 1 change output
        const setupInputVBytes = 2 * 58; // P2TR inputs ~58 vB each
        const setupOutputVBytes = outputCount * 43 + 43; // P2WSH outputs ~43 vB, change ~43 vB
        const setupOverhead = 11; // version, locktime, counts
        const setupVBytes = setupOverhead + setupInputVBytes + setupOutputVBytes;

        // Reveal tx: N P2WSH inputs (each with up to 98 data chunks) + contract output + change
        const revealWeight = 40 + outputCount * HashCommitmentGenerator.WEIGHT_PER_INPUT + 200;
        const revealVBytes = Math.ceil(revealWeight / 4);

        const setupFee = BigInt(Math.ceil(setupVBytes * feeRate));
        const revealFee = BigInt(Math.ceil(revealVBytes * feeRate));
        const totalFee = setupFee + revealFee;

        const outputsValue = BigInt(outputCount) * HashCommitmentGenerator.MIN_OUTPUT_VALUE;
        const totalCost = totalFee + outputsValue;

        return {
            compressedSize,
            outputCount,
            chunkCount,
            setupVBytes,
            revealVBytes,
            setupFee,
            revealFee,
            totalFee,
            outputsValue,
            totalCost,
        };
    }

    /**
     * Calculate the HASH160 of a data chunk.
     * HASH160 = RIPEMD160(SHA256(data))
     */
    public hashChunk(data: Uint8Array): Uint8Array {
        return crypto.hash160(data);
    }

    /**
     * Generate a hash-committed witness script for multiple data chunks.
     *
     * Script structure (for N chunks):
     * OP_HASH160 <hash_N> OP_EQUALVERIFY
     * OP_HASH160 <hash_N-1> OP_EQUALVERIFY
     * ...
     * OP_HASH160 <hash_1> OP_EQUALVERIFY
     * <pubkey> OP_CHECKSIG
     *
     * Hashes are in reverse order because witness stack is LIFO.
     * Witness stack: [sig, data_1, data_2, ..., data_N, witnessScript]
     * Stack before execution: [sig, data_1, data_2, ..., data_N] (data_N on top)
     *
     * @param dataHashes Array of HASH160 values (in data order, will be reversed in script)
     * @returns The compiled witness script
     */
    public generateWitnessScript(dataHashes: Uint8Array[]): Uint8Array {
        if (dataHashes.length === 0) {
            throw new Error('At least one data hash is required');
        }

        if (dataHashes.length > HashCommitmentGenerator.MAX_CHUNKS_PER_OUTPUT) {
            throw new Error(
                `Too many chunks: ${dataHashes.length} exceeds limit of ${HashCommitmentGenerator.MAX_CHUNKS_PER_OUTPUT}`,
            );
        }

        for (const hash of dataHashes) {
            if (hash.length !== 20) {
                throw new Error(`HASH160 requires 20-byte hash, got ${hash.length}`);
            }
        }

        // Build script parts - hashes in reverse order (last data chunk verified first)
        const scriptParts: (number | Uint8Array)[] = [];

        // Add hash commitments in reverse order
        for (let i = dataHashes.length - 1; i >= 0; i--) {
            scriptParts.push(opcodes.OP_HASH160);
            scriptParts.push(dataHashes[i]);
            scriptParts.push(opcodes.OP_EQUALVERIFY);
        }

        // Add signature check
        scriptParts.push(this.publicKey);
        scriptParts.push(opcodes.OP_CHECKSIG);

        return script.compile(scriptParts);
    }

    /**
     * Generate a P2WSH address from a witness script.
     *
     * @param witnessScript The witness script
     * @returns P2WSH address info
     */
    public generateP2WSHAddress(
        witnessScript: Uint8Array | Script,
    ): IP2WSHAddress & { scriptPubKey: Uint8Array } {
        const p2wsh = payments.p2wsh({
            redeem: { output: witnessScript as Script },
            network: this.network,
        });

        if (!p2wsh.address || !p2wsh.output) {
            throw new Error('Failed to generate P2WSH address');
        }

        return {
            address: p2wsh.address,
            witnessScript,
            scriptPubKey: p2wsh.output,
        };
    }

    /**
     * Split data into chunks and generate hash-committed P2WSH outputs.
     *
     * Each output commits to up to 98 data chunks (80 bytes each = 7,840 bytes).
     * This is MUCH more efficient than one output per chunk.
     *
     * @param data The data to chunk and commit
     * @param maxChunkSize Maximum bytes per stack item (default: 80, P2WSH stack item limit)
     * @returns Array of hash-committed P2WSH outputs
     */
    public prepareChunks(
        data: Uint8Array,
        maxChunkSize: number = HashCommitmentGenerator.MAX_CHUNK_SIZE,
    ): IHashCommittedP2WSH[] {
        if (maxChunkSize > HashCommitmentGenerator.MAX_CHUNK_SIZE) {
            throw new Error(
                `Chunk size ${maxChunkSize} exceeds P2WSH stack item limit of ${HashCommitmentGenerator.MAX_CHUNK_SIZE}`,
            );
        }

        if (data.length === 0) {
            throw new Error('Data cannot be empty');
        }

        // First, split data into 80-byte chunks
        const allChunks: Uint8Array[] = [];
        let offset = 0;

        while (offset < data.length) {
            const chunkSize = Math.min(maxChunkSize, data.length - offset);
            allChunks.push(new Uint8Array(data.subarray(offset, offset + chunkSize)));
            offset += chunkSize;
        }

        // Now batch chunks into outputs (up to 98 chunks per output)
        const outputs: IHashCommittedP2WSH[] = [];
        let chunkIndex = 0;

        while (chunkIndex < allChunks.length) {
            const chunksForThisOutput = allChunks.slice(
                chunkIndex,
                chunkIndex + HashCommitmentGenerator.MAX_CHUNKS_PER_OUTPUT,
            );

            const dataChunks = chunksForThisOutput;
            const dataHashes = dataChunks.map((chunk) => this.hashChunk(chunk));

            const witnessScript = this.generateWitnessScript(dataHashes);
            const p2wsh = this.generateP2WSHAddress(witnessScript);

            outputs.push({
                address: p2wsh.address,
                witnessScript: p2wsh.witnessScript,
                scriptPubKey: p2wsh.scriptPubKey,
                dataHashes,
                dataChunks,
                chunkStartIndex: chunkIndex,
            });

            chunkIndex += chunksForThisOutput.length;
        }

        const totalChunks = allChunks.length;
        this.log(
            `Prepared ${outputs.length} P2WSH outputs with ${totalChunks} chunks ` +
                `(${data.length} bytes, ~${Math.ceil(data.length / outputs.length)} bytes/output)`,
        );

        return outputs;
    }
}
