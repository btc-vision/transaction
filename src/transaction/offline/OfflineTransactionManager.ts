import { fromHex, Psbt, Signer, toHex } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import { TransactionType } from '../enums/TransactionType.js';
import { TransactionBuilder } from '../builders/TransactionBuilder.js';
import { MultiSignTransaction } from '../builders/MultiSignTransaction.js';
import { ISerializableTransactionState, PrecomputedData } from './interfaces/ISerializableState.js';
import { TransactionSerializer } from './TransactionSerializer.js';
import { ReconstructionOptions, TransactionReconstructor } from './TransactionReconstructor.js';
import { TransactionStateCapture } from './TransactionStateCapture.js';
import { isMultiSigSpecificData } from './interfaces/ITypeSpecificData.js';
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
            pubkeys: Uint8Array[];
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
            scriptElements: (Uint8Array | number)[];
            witnesses: Uint8Array[];
            annex?: Uint8Array;
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
            compiledTargetScript: Uint8Array | string;
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
     * @returns New serialized state with updated fees (not signed yet)
     */
    public static rebuildWithNewFees(serializedState: string, newFeeRate: number): string {
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
     * Parse base64-encoded state into state object
     * @param base64State - Base64-encoded state
     * @returns Parsed state object
     */
    public static fromBase64(base64State: string): ISerializableTransactionState {
        return TransactionSerializer.fromBase64(base64State);
    }

    /**
     * Serialize state object to base64
     * @param state - State object to serialize
     * @returns Base64-encoded state
     */
    public static toBase64(state: ISerializableTransactionState): string {
        return TransactionSerializer.toBase64(state);
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

    /**
     * Add a partial signature to a multisig transaction state.
     * This method signs the transaction with the provided signer and returns
     * updated state with the new signature included.
     *
     * @param serializedState - Base64-encoded multisig state
     * @param signer - The signer to add a signature with
     * @returns Updated state with new signature, and signing result
     */
    public static async multiSigAddSignature(
        serializedState: string,
        signer: Signer | UniversalSigner,
    ): Promise<{
        state: string;
        signed: boolean;
        final: boolean;
        psbtBase64: string;
    }> {
        const state = TransactionSerializer.fromBase64(serializedState);

        if (!isMultiSigSpecificData(state.typeSpecificData)) {
            throw new Error('State is not a multisig transaction');
        }

        const typeData = state.typeSpecificData;
        const pubkeys = typeData.pubkeys.map((pk) => fromHex(pk));

        // Parse existing PSBT or create new one
        let psbt: Psbt;
        const network = TransactionReconstructor['nameToNetwork'](state.baseParams.networkName);

        if (typeData.existingPsbtBase64) {
            psbt = Psbt.fromBase64(typeData.existingPsbtBase64, { network });
        } else {
            // Need to build the transaction first
            const builder = this.importForSigning(serializedState, {
                signer,
            }) as MultiSignTransaction;
            psbt = await builder.signPSBT();
        }

        // Calculate minimums array for each input
        const minimums: number[] = [];
        for (let i = typeData.originalInputCount; i < psbt.data.inputs.length; i++) {
            minimums.push(typeData.minimumSignatures);
        }

        // Sign the PSBT
        const result = MultiSignTransaction.signPartial(
            psbt,
            signer,
            typeData.originalInputCount,
            minimums,
        );

        // Finalize inputs (partial finalization to preserve signatures)
        const orderedPubKeys: Uint8Array[][] = [];
        for (let i = typeData.originalInputCount; i < psbt.data.inputs.length; i++) {
            orderedPubKeys.push(pubkeys);
        }

        MultiSignTransaction.attemptFinalizeInputs(
            psbt,
            typeData.originalInputCount,
            orderedPubKeys,
            result.final,
        );

        const newPsbtBase64 = psbt.toBase64();

        // Update the state with new PSBT
        const newState: ISerializableTransactionState = {
            ...state,
            typeSpecificData: {
                ...typeData,
                existingPsbtBase64: newPsbtBase64,
            },
        };

        return {
            state: TransactionSerializer.toBase64(newState),
            signed: result.signed,
            final: result.final,
            psbtBase64: newPsbtBase64,
        };
    }

    /**
     * Check if a public key has already signed a multisig transaction
     *
     * @param serializedState - Base64-encoded multisig state
     * @param signerPubKey - Public key to check (Buffer or hex string)
     * @returns True if the public key has already signed
     */
    public static multiSigHasSigned(
        serializedState: string,
        signerPubKey: Uint8Array | string,
    ): boolean {
        const state = TransactionSerializer.fromBase64(serializedState);

        if (!isMultiSigSpecificData(state.typeSpecificData)) {
            throw new Error('State is not a multisig transaction');
        }

        const typeData = state.typeSpecificData;

        if (!typeData.existingPsbtBase64) {
            return false;
        }

        const network = TransactionReconstructor['nameToNetwork'](state.baseParams.networkName);
        const psbt = Psbt.fromBase64(typeData.existingPsbtBase64, { network });

        const pubKeyBuffer = signerPubKey instanceof Uint8Array
            ? signerPubKey
            : fromHex(signerPubKey);

        return MultiSignTransaction.verifyIfSigned(psbt, pubKeyBuffer);
    }

    /**
     * Get the current signature count for a multisig transaction
     *
     * @param serializedState - Base64-encoded multisig state
     * @returns Object with signature count info
     */
    public static multiSigGetSignatureStatus(serializedState: string): {
        required: number;
        collected: number;
        isComplete: boolean;
        signers: string[];
    } {
        const state = TransactionSerializer.fromBase64(serializedState);

        if (!isMultiSigSpecificData(state.typeSpecificData)) {
            throw new Error('State is not a multisig transaction');
        }

        const typeData = state.typeSpecificData;
        const required = typeData.minimumSignatures;

        if (!typeData.existingPsbtBase64) {
            return {
                required,
                collected: 0,
                isComplete: false,
                signers: [],
            };
        }

        const network = TransactionReconstructor['nameToNetwork'](state.baseParams.networkName);
        const psbt = Psbt.fromBase64(typeData.existingPsbtBase64, { network });

        // Collect signers from all inputs
        const signerSet = new Set<string>();

        for (let i = typeData.originalInputCount; i < psbt.data.inputs.length; i++) {
            const input = psbt.data.inputs[i];

            if (input.tapScriptSig) {
                for (const sig of input.tapScriptSig) {
                    signerSet.add(toHex(sig.pubkey));
                }
            }

            if (input.finalScriptWitness) {
                const decoded = TransactionBuilder.readScriptWitnessToWitnessStack(
                    input.finalScriptWitness,
                );

                for (let j = 0; j < decoded.length - 2; j += 3) {
                    const pubKey = decoded[j + 2];
                    signerSet.add(toHex(pubKey));
                }
            }
        }

        const signers = Array.from(signerSet);

        return {
            required,
            collected: signers.length,
            isComplete: signers.length >= required,
            signers,
        };
    }

    /**
     * Finalize a multisig transaction and extract the signed transaction hex.
     * Only call this when all required signatures have been collected.
     *
     * @param serializedState - Base64-encoded multisig state with all signatures
     * @returns Signed transaction hex ready for broadcast
     */
    public static multiSigFinalize(serializedState: string): string {
        const state = TransactionSerializer.fromBase64(serializedState);

        if (!isMultiSigSpecificData(state.typeSpecificData)) {
            throw new Error('State is not a multisig transaction');
        }

        const typeData = state.typeSpecificData;

        if (!typeData.existingPsbtBase64) {
            throw new Error('No PSBT found in state - transaction has not been signed');
        }

        const network = TransactionReconstructor['nameToNetwork'](state.baseParams.networkName);
        const psbt = Psbt.fromBase64(typeData.existingPsbtBase64, { network });

        const pubkeys = typeData.pubkeys.map((pk) => fromHex(pk));
        const orderedPubKeys: Uint8Array[][] = [];

        for (let i = typeData.originalInputCount; i < psbt.data.inputs.length; i++) {
            orderedPubKeys.push(pubkeys);
        }

        // Final finalization
        const success = MultiSignTransaction.attemptFinalizeInputs(
            psbt,
            typeData.originalInputCount,
            orderedPubKeys,
            true, // isFinal = true
        );

        if (!success) {
            throw new Error('Failed to finalize multisig transaction - not enough signatures');
        }

        return psbt.extractTransaction(true, true).toHex();
    }

    /**
     * Get the PSBT from a multisig state (for external signing tools)
     *
     * @param serializedState - Base64-encoded multisig state
     * @returns PSBT in base64 format, or null if not yet built
     */
    public static multiSigGetPsbt(serializedState: string): string | null {
        const state = TransactionSerializer.fromBase64(serializedState);

        if (!isMultiSigSpecificData(state.typeSpecificData)) {
            throw new Error('State is not a multisig transaction');
        }

        return state.typeSpecificData.existingPsbtBase64 || null;
    }

    /**
     * Update the PSBT in a multisig state (after external signing)
     *
     * @param serializedState - Base64-encoded multisig state
     * @param psbtBase64 - New PSBT with additional signatures
     * @returns Updated state
     */
    public static multiSigUpdatePsbt(serializedState: string, psbtBase64: string): string {
        const state = TransactionSerializer.fromBase64(serializedState);

        if (!isMultiSigSpecificData(state.typeSpecificData)) {
            throw new Error('State is not a multisig transaction');
        }

        const newState: ISerializableTransactionState = {
            ...state,
            typeSpecificData: {
                ...state.typeSpecificData,
                existingPsbtBase64: psbtBase64,
            },
        };

        return TransactionSerializer.toBase64(newState);
    }
}
