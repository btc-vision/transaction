import { TransactionType } from '../enums/TransactionType.js';
import { TransactionBuilder } from '../builders/TransactionBuilder.js';
import { ISerializableTransactionState, PrecomputedData } from './interfaces/ISerializableState.js';
import { TransactionSerializer } from './TransactionSerializer.js';
import { TransactionReconstructor, ReconstructionOptions } from './TransactionReconstructor.js';
import { TransactionStateCapture } from './TransactionStateCapture.js';
import {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
} from '../interfaces/ITransactionParameters.js';

/**
 * Export options for offline transaction signing
 */
export interface ExportOptions {
    /** The original transaction parameters */
    params: ITransactionParameters;
    /** Transaction type */
    type: TransactionType;
    /** Precomputed data from the builder */
    precomputed?: Partial<PrecomputedData>;
}

/**
 * Main entry point for offline transaction signing workflow.
 *
 * This class provides a complete API for:
 * 1. Phase 1 (Online): Building transactions and exporting state for offline signing
 * 2. Phase 2 (Offline): Importing state, providing signers, and signing transactions
 *
 * Also supports fee bumping by allowing reconstruction with new fee parameters.
 *
 * @example
 * ```typescript
 * // Phase 1 (Online environment)
 * const params: IFundingTransactionParameters = { ... };
 * const state = OfflineTransactionManager.exportFunding(params);
 * // Send state to offline environment
 *
 * // Phase 2 (Offline environment)
 * const signedTxHex = await OfflineTransactionManager.importSignAndExport(state, {
 *     signer: offlineSigner,
 * });
 * // Send signedTxHex back to online environment for broadcast
 * ```
 */
export class OfflineTransactionManager {
    /**
     * Export a FundingTransaction for offline signing
     * @param params - Funding transaction parameters
     * @param precomputed - Optional precomputed data
     * @returns Base64-encoded serialized state
     */
    public static exportFunding(
        params: IFundingTransactionParameters,
        precomputed?: Partial<PrecomputedData>,
    ): string {
        const state = TransactionStateCapture.fromFunding(params, precomputed);
        return TransactionSerializer.toBase64(state);
    }

    /**
     * Export a DeploymentTransaction for offline signing
     * @param params - Deployment transaction parameters
     * @param precomputed - Required precomputed data (randomBytes, compiledTargetScript)
     * @returns Base64-encoded serialized state
     */
    public static exportDeployment(
        params: IDeploymentParameters,
        precomputed: Partial<PrecomputedData> & {
            compiledTargetScript: string;
            randomBytes: string;
        },
    ): string {
        const state = TransactionStateCapture.fromDeployment(params, precomputed);
        return TransactionSerializer.toBase64(state);
    }

    /**
     * Export an InteractionTransaction for offline signing
     * @param params - Interaction transaction parameters
     * @param precomputed - Required precomputed data (randomBytes, compiledTargetScript)
     * @returns Base64-encoded serialized state
     */
    public static exportInteraction(
        params: IInteractionParameters,
        precomputed: Partial<PrecomputedData> & {
            compiledTargetScript: string;
            randomBytes: string;
        },
    ): string {
        const state = TransactionStateCapture.fromInteraction(params, precomputed);
        return TransactionSerializer.toBase64(state);
    }

    /**
     * Export a MultiSignTransaction for offline signing
     * @param params - MultiSig transaction parameters
     * @param precomputed - Optional precomputed data
     * @returns Base64-encoded serialized state
     */
    public static exportMultiSig(
        params: ITransactionParameters & {
            pubkeys: Buffer[];
            minimumSignatures: number;
            receiver: string;
            requestedAmount: bigint;
            refundVault: string;
            originalInputCount?: number;
            existingPsbtBase64?: string;
        },
        precomputed?: Partial<PrecomputedData>,
    ): string {
        const state = TransactionStateCapture.fromMultiSig(params, precomputed);
        return TransactionSerializer.toBase64(state);
    }

    /**
     * Export a CustomScriptTransaction for offline signing
     * @param params - Custom script transaction parameters
     * @param precomputed - Optional precomputed data
     * @returns Base64-encoded serialized state
     */
    public static exportCustomScript(
        params: ITransactionParameters & {
            scriptElements: (Buffer | number)[];
            witnesses: Buffer[];
            annex?: Buffer;
        },
        precomputed?: Partial<PrecomputedData>,
    ): string {
        const state = TransactionStateCapture.fromCustomScript(params, precomputed);
        return TransactionSerializer.toBase64(state);
    }

    /**
     * Export a CancelTransaction for offline signing
     * @param params - Cancel transaction parameters
     * @param precomputed - Optional precomputed data
     * @returns Base64-encoded serialized state
     */
    public static exportCancel(
        params: ITransactionParameters & {
            compiledTargetScript: Buffer | string;
        },
        precomputed?: Partial<PrecomputedData>,
    ): string {
        const state = TransactionStateCapture.fromCancel(params, precomputed);
        return TransactionSerializer.toBase64(state);
    }

    /**
     * Export transaction state from a builder instance.
     * The builder must have been built but not yet signed.
     * @param builder - Transaction builder instance
     * @param params - Original construction parameters
     * @param precomputed - Precomputed data from the builder
     * @returns Base64-encoded serialized state
     */
    public static exportFromBuilder<T extends TransactionType>(
        builder: TransactionBuilder<T>,
        params: ITransactionParameters,
        precomputed?: Partial<PrecomputedData>,
    ): string {
        const type = builder.type;
        let state: ISerializableTransactionState;

        switch (type) {
            case TransactionType.FUNDING:
                state = TransactionStateCapture.fromFunding(
                    params as IFundingTransactionParameters,
                    precomputed,
                );
                break;
            case TransactionType.DEPLOYMENT:
                state = TransactionStateCapture.fromDeployment(
                    params as IDeploymentParameters,
                    precomputed as Partial<PrecomputedData> & {
                        compiledTargetScript: string;
                        randomBytes: string;
                    },
                );
                break;
            case TransactionType.INTERACTION:
                state = TransactionStateCapture.fromInteraction(
                    params as IInteractionParameters,
                    precomputed as Partial<PrecomputedData> & {
                        compiledTargetScript: string;
                        randomBytes: string;
                    },
                );
                break;
            default:
                throw new Error(`Unsupported transaction type for export: ${type}`);
        }

        return TransactionSerializer.toBase64(state);
    }

    /**
     * Import and reconstruct transaction for signing
     * @param serializedState - Base64-encoded state from Phase 1
     * @param options - Signer(s) and optional fee overrides
     * @returns Reconstructed transaction builder ready for signing
     */
    public static importForSigning(
        serializedState: string,
        options: ReconstructionOptions,
    ): TransactionBuilder<TransactionType> {
        const state = TransactionSerializer.fromBase64(serializedState);
        return TransactionReconstructor.reconstruct(state, options);
    }

    /**
     * Complete signing and export signed transaction
     * @param builder - Reconstructed builder from importForSigning
     * @returns Signed transaction hex ready for broadcast
     */
    public static async signAndExport(
        builder: TransactionBuilder<TransactionType>,
    ): Promise<string> {
        const tx = await builder.signTransaction();
        return tx.toHex();
    }

    /**
     * Convenience: Full Phase 2 in one call - import, sign, and export
     * @param serializedState - Base64-encoded state
     * @param options - Signer(s) and optional fee overrides
     * @returns Signed transaction hex ready for broadcast
     */
    public static async importSignAndExport(
        serializedState: string,
        options: ReconstructionOptions,
    ): Promise<string> {
        const builder = this.importForSigning(serializedState, options);
        return this.signAndExport(builder);
    }

    /**
     * Rebuild transaction with new fee rate (fee bumping)
     * @param serializedState - Original state
     * @param newFeeRate - New fee rate in sat/vB
     * @param _options - Signer options (unused, kept for API consistency)
     * @returns New serialized state with updated fees (not signed yet)
     */
    public static rebuildWithNewFees(
        serializedState: string,
        newFeeRate: number,
        _options: ReconstructionOptions,
    ): string {
        // Parse the existing state
        const state = TransactionSerializer.fromBase64(serializedState);

        // Create a new state with updated fee rate
        const newState: ISerializableTransactionState = {
            ...state,
            baseParams: {
                ...state.baseParams,
                feeRate: newFeeRate,
            },
        };

        return TransactionSerializer.toBase64(newState);
    }

    /**
     * Rebuild and immediately sign with new fee rate
     * @param serializedState - Original state
     * @param newFeeRate - New fee rate in sat/vB
     * @param options - Signer options
     * @returns Signed transaction hex with new fees
     */
    public static async rebuildSignAndExport(
        serializedState: string,
        newFeeRate: number,
        options: ReconstructionOptions,
    ): Promise<string> {
        const builder = this.importForSigning(serializedState, {
            ...options,
            newFeeRate,
        });
        return this.signAndExport(builder);
    }

    /**
     * Inspect serialized state without signing
     * @param serializedState - Base64-encoded state
     * @returns Parsed state object for inspection
     */
    public static inspect(serializedState: string): ISerializableTransactionState {
        return TransactionSerializer.fromBase64(serializedState);
    }

    /**
     * Validate serialized state integrity
     * @param serializedState - Base64-encoded state
     * @returns True if checksum and format are valid
     */
    public static validate(serializedState: string): boolean {
        try {
            TransactionSerializer.fromBase64(serializedState);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get transaction type from serialized state
     * @param serializedState - Base64-encoded state
     * @returns Transaction type enum value
     */
    public static getType(serializedState: string): TransactionType {
        const state = TransactionSerializer.fromBase64(serializedState);
        return state.header.transactionType;
    }

    /**
     * Convert serialized state to hex format
     * @param serializedState - Base64-encoded state
     * @returns Hex-encoded state
     */
    public static toHex(serializedState: string): string {
        const state = TransactionSerializer.fromBase64(serializedState);
        return TransactionSerializer.toHex(state);
    }

    /**
     * Convert hex format back to base64
     * @param hexState - Hex-encoded state
     * @returns Base64-encoded state
     */
    public static fromHex(hexState: string): string {
        const state = TransactionSerializer.fromHex(hexState);
        return TransactionSerializer.toBase64(state);
    }

}
