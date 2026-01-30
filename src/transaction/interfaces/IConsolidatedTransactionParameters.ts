import type { IInteractionParameters } from './ITransactionParameters.js';
import type { IP2WSHAddress } from '../mineable/IP2WSHAddress.js';

/**
 * Extended P2WSH address with hash commitments for CHCT system.
 * Each output commits to multiple data chunk hashes (up to 98 chunks per output).
 *
 * Witness script structure:
 * OP_HASH160 <hash_N> OP_EQUALVERIFY ... OP_HASH160 <hash_1> OP_EQUALVERIFY <pubkey> OP_CHECKSIG
 *
 * Witness stack when spending:
 * [signature, data_1, data_2, ..., data_N, witnessScript]
 */
export interface IHashCommittedP2WSH extends IP2WSHAddress {
    /** The HASH160 values of all data chunks this output commits to (in order) */
    readonly dataHashes: Uint8Array[];
    /** The actual data chunks (stored for later reveal, in order) */
    readonly dataChunks: Uint8Array[];
    /** The starting index of this output's chunks in the overall data sequence */
    readonly chunkStartIndex: number;
    /** The P2WSH scriptPubKey (OP_0 <32-byte-hash>) */
    readonly scriptPubKey: Uint8Array;
}

/**
 * Parameters for ConsolidatedInteractionTransaction.
 * Uses the same parameters as InteractionTransaction plus optional maxChunkSize.
 */
export interface IConsolidatedInteractionParameters extends IInteractionParameters {
    /** Maximum bytes per stack item (default: 80, policy limit) */
    readonly maxChunkSize?: number;
}

/**
 * Result from the setup transaction.
 */
export interface ISetupTransactionResult {
    /** The signed transaction hex */
    readonly txHex: string;
    /** Transaction ID */
    readonly txId: string;
    /** All P2WSH outputs created (with metadata for reveal) */
    readonly outputs: IHashCommittedP2WSH[];
    /** Fees paid in satoshis */
    readonly feesPaid: bigint;
    /** Number of data chunks */
    readonly chunkCount: number;
    /** Total data size in bytes (compiled) */
    readonly totalDataSize: number;
}

/**
 * Result from the reveal transaction.
 */
export interface IRevealTransactionResult {
    /** The signed transaction hex */
    readonly txHex: string;
    /** Transaction ID */
    readonly txId: string;
    /** Total data revealed in bytes */
    readonly dataSize: number;
    /** Fees paid in satoshis */
    readonly feesPaid: bigint;
    /** Number of inputs spent */
    readonly inputCount: number;
}

/**
 * Complete result from the consolidated interaction transaction.
 */
export interface IConsolidatedInteractionResult {
    /** Setup transaction result */
    readonly setup: ISetupTransactionResult;
    /** Reveal transaction result */
    readonly reveal: IRevealTransactionResult;
    /** Total fees across both transactions in satoshis */
    readonly totalFees: bigint;
}
