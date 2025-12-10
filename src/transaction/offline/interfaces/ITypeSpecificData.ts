import { TransactionType } from '../../enums/TransactionType.js';
import { RawChallenge } from '../../../epoch/interfaces/IChallengeSolution.js';

/**
 * Discriminated union for type-specific serialized data
 */
export type TypeSpecificData =
    | FundingSpecificData
    | DeploymentSpecificData
    | InteractionSpecificData
    | MultiSigSpecificData
    | CustomScriptSpecificData
    | CancelSpecificData;

/**
 * Funding transaction specific data
 */
export interface FundingSpecificData {
    readonly type: TransactionType.FUNDING;
    /** Amount to send in satoshis */
    readonly amount: string; // bigint as string
    /** Number of outputs to split into */
    readonly splitInputsInto: number;
}

/**
 * Deployment transaction specific data
 */
export interface DeploymentSpecificData {
    readonly type: TransactionType.DEPLOYMENT;
    /** Compressed bytecode (hex) */
    readonly bytecode: string;
    /** Constructor calldata (hex) */
    readonly calldata?: string;
    /** Challenge solution for epoch */
    readonly challenge: RawChallenge;
    /** Reveal MLDSA public key in transaction */
    readonly revealMLDSAPublicKey?: boolean;
    /** Link MLDSA public key to legacy address */
    readonly linkMLDSAPublicKeyToAddress?: boolean;
    /** Hashed MLDSA public key (hex) */
    readonly hashedPublicKey?: string;
}

/**
 * Interaction transaction specific data
 */
export interface InteractionSpecificData {
    readonly type: TransactionType.INTERACTION;
    /** Compressed calldata (hex) */
    readonly calldata: string;
    /** Contract address/identifier */
    readonly contract?: string;
    /** Challenge solution for epoch */
    readonly challenge: RawChallenge;
    /** Loaded storage for access list */
    readonly loadedStorage?: SerializedLoadedStorage;
    /** Whether this is a cancellation */
    readonly isCancellation?: boolean;
    /** Disable auto refund */
    readonly disableAutoRefund?: boolean;
    /** Reveal MLDSA public key in transaction */
    readonly revealMLDSAPublicKey?: boolean;
    /** Link MLDSA public key to legacy address */
    readonly linkMLDSAPublicKeyToAddress?: boolean;
    /** Hashed MLDSA public key (hex) */
    readonly hashedPublicKey?: string;
}

/**
 * Loaded storage serialization format
 */
export interface SerializedLoadedStorage {
    [key: string]: string[];
}

/**
 * MultiSig transaction specific data
 */
export interface MultiSigSpecificData {
    readonly type: TransactionType.MULTI_SIG;
    /** Public keys (hex array) */
    readonly pubkeys: string[];
    /** M of N (minimum signatures required) */
    readonly minimumSignatures: number;
    /** Receiver address */
    readonly receiver: string;
    /** Requested amount to send */
    readonly requestedAmount: string; // bigint as string
    /** Refund vault address */
    readonly refundVault: string;
    /** Original input count (for partial signing) */
    readonly originalInputCount: number;
    /** Existing PSBT state (base64) if partially signed */
    readonly existingPsbtBase64?: string;
}

/**
 * Serialized script element for custom scripts
 */
export interface SerializedScriptElement {
    /** Element type */
    readonly elementType: 'buffer' | 'opcode';
    /** Value as hex (buffer) or opcode number */
    readonly value: string | number;
}

/**
 * Custom script transaction specific data
 */
export interface CustomScriptSpecificData {
    readonly type: TransactionType.CUSTOM_CODE;
    /** Bitcoin script elements */
    readonly scriptElements: SerializedScriptElement[];
    /** Witnesses (hex array) */
    readonly witnesses: string[];
    /** Optional annex data (hex) */
    readonly annex?: string;
}

/**
 * Cancel transaction specific data
 */
export interface CancelSpecificData {
    readonly type: TransactionType.CANCEL;
    /** Compiled target script to cancel (hex) */
    readonly compiledTargetScript: string;
}

/**
 * Type guard for FundingSpecificData
 */
export function isFundingSpecificData(data: TypeSpecificData): data is FundingSpecificData {
    return data.type === TransactionType.FUNDING;
}

/**
 * Type guard for DeploymentSpecificData
 */
export function isDeploymentSpecificData(data: TypeSpecificData): data is DeploymentSpecificData {
    return data.type === TransactionType.DEPLOYMENT;
}

/**
 * Type guard for InteractionSpecificData
 */
export function isInteractionSpecificData(data: TypeSpecificData): data is InteractionSpecificData {
    return data.type === TransactionType.INTERACTION;
}

/**
 * Type guard for MultiSigSpecificData
 */
export function isMultiSigSpecificData(data: TypeSpecificData): data is MultiSigSpecificData {
    return data.type === TransactionType.MULTI_SIG;
}

/**
 * Type guard for CustomScriptSpecificData
 */
export function isCustomScriptSpecificData(
    data: TypeSpecificData,
): data is CustomScriptSpecificData {
    return data.type === TransactionType.CUSTOM_CODE;
}

/**
 * Type guard for CancelSpecificData
 */
export function isCancelSpecificData(data: TypeSpecificData): data is CancelSpecificData {
    return data.type === TransactionType.CANCEL;
}
