import { TransactionType } from '../../enums/TransactionType.js';
import { ChainId } from '../../../network/ChainId.js';
import type { TypeSpecificData } from './ITypeSpecificData.js';

/**
 * Format version for serialization compatibility
 */
export const SERIALIZATION_FORMAT_VERSION = 1;

/**
 * Magic byte for identifying serialized transaction state
 */
export const SERIALIZATION_MAGIC_BYTE = 0x42; // 'B' for Bitcoin

/**
 * Version header for forward compatibility
 */
export interface SerializationHeader {
    /** Format version for migration support */
    readonly formatVersion: number;
    /** Consensus version at serialization time */
    readonly consensusVersion: number;
    /** Transaction type discriminant */
    readonly transactionType: TransactionType;
    /** Chain identifier */
    readonly chainId: ChainId;
    /** Timestamp of serialization (Unix epoch ms) */
    readonly timestamp: number;
}

/**
 * Serialized UTXO representation
 */
export interface SerializedUTXO {
    /** Transaction ID (32 bytes hex) */
    readonly transactionId: string;
    /** Output index (vout) */
    readonly outputIndex: number;
    /** Value in satoshis */
    readonly value: string; // bigint as string for JSON compatibility
    /** Script pubkey hex */
    readonly scriptPubKeyHex: string;
    /** Address derived from script (for signer lookup in rotation mode) */
    readonly scriptPubKeyAddress?: string;
    /** P2SH redeem script (hex) */
    readonly redeemScript?: string;
    /** P2WSH witness script (hex) */
    readonly witnessScript?: string;
    /** Full previous transaction for legacy scripts (hex) */
    readonly nonWitnessUtxo?: string;
}

/**
 * Serialized output representation
 */
export interface SerializedOutput {
    /** Value in satoshis */
    readonly value: number;
    /** Destination address */
    readonly address?: string;
    /** Output script (hex) */
    readonly script?: string;
    /** Taproot internal key (hex) */
    readonly tapInternalKey?: string;
}

/**
 * Serialized address-to-input-index mapping for address rotation
 */
export interface SerializedSignerMapping {
    /** Address that should sign these inputs */
    readonly address: string;
    /** Input indices this address should sign */
    readonly inputIndices: number[];
}

/**
 * Base transaction parameters (common to all types)
 */
export interface SerializedBaseParams {
    /** Sender address */
    readonly from: string;
    /** Recipient address (optional for some tx types) */
    readonly to?: string;
    /** Fee rate in sat/vB */
    readonly feeRate: number;
    /** OPNet priority fee */
    readonly priorityFee: string; // bigint as string
    /** OPNet gas sat fee */
    readonly gasSatFee: string; // bigint as string
    /** Network identifier */
    readonly networkName: 'mainnet' | 'testnet' | 'regtest';
    /** Transaction version (1, 2, or 3) */
    readonly txVersion: number;
    /** Optional note data (hex) */
    readonly note?: string;
    /** Whether to include anchor output */
    readonly anchor: boolean;
    /** Debug fee logging */
    readonly debugFees?: boolean;
}

/**
 * Pre-computed data that must be preserved for deterministic rebuild
 */
export interface PrecomputedData {
    /** Compiled target script (hex) - saves recomputation */
    readonly compiledTargetScript?: string;
    /** Random bytes used (hex) - MUST be preserved for determinism */
    readonly randomBytes?: string;
    /** Estimated fees from initial build */
    readonly estimatedFees?: string; // bigint as string
    /** Contract seed for deployment (hex) */
    readonly contractSeed?: string;
    /** Contract address for deployment */
    readonly contractAddress?: string;
}

/**
 * Complete serializable transaction state
 */
export interface ISerializableTransactionState {
    /** Version and type header */
    readonly header: SerializationHeader;
    /** Base transaction parameters */
    readonly baseParams: SerializedBaseParams;
    /** Primary UTXOs */
    readonly utxos: SerializedUTXO[];
    /** Optional additional inputs */
    readonly optionalInputs: SerializedUTXO[];
    /** Optional additional outputs */
    readonly optionalOutputs: SerializedOutput[];
    /** Whether address rotation mode is enabled */
    readonly addressRotationEnabled: boolean;
    /** Address to input indices mapping for rotation mode */
    readonly signerMappings: SerializedSignerMapping[];
    /** Type-specific data (discriminated by header.transactionType) */
    readonly typeSpecificData: TypeSpecificData;
    /** Pre-computed data for deterministic rebuild */
    readonly precomputedData: PrecomputedData;
}
