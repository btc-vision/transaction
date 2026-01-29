import { type Network, type PsbtOutputExtended, toHex } from '@btc-vision/bitcoin';
import type { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ChainId } from '../../network/ChainId.js';
import { currentConsensus } from '../../consensus/ConsensusConfig.js';
import { TransactionType } from '../enums/TransactionType.js';
import type {
    ISerializableTransactionState,
    PrecomputedData,
    SerializationHeader,
    SerializedBaseParams,
    SerializedOutput,
    SerializedSignerMapping,
    SerializedUTXO,
} from './interfaces/ISerializableState.js';
import { SERIALIZATION_FORMAT_VERSION } from './interfaces/ISerializableState.js';
import type {
    CancelSpecificData,
    CustomScriptSpecificData,
    DeploymentSpecificData,
    FundingSpecificData,
    InteractionSpecificData,
    MultiSigSpecificData,
    SerializedScriptElement,
    TypeSpecificData,
} from './interfaces/ITypeSpecificData.js';
import type {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
} from '../interfaces/ITransactionParameters.js';

/**
 * Parameters required to capture state from any transaction builder
 */
export interface CaptureParams {
    /** The original transaction parameters */
    params: ITransactionParameters;
    /** The transaction type */
    type: TransactionType;
    /** Pre-computed data from the builder */
    precomputed?: Partial<PrecomputedData>;
}

/**
 * Captures transaction state from builders for offline signing.
 * This class creates serializable state objects from transaction parameters.
 */
export class TransactionStateCapture {
    /**
     * Capture state from a FundingTransaction
     */
    public static fromFunding(
        params: IFundingTransactionParameters,
        precomputed?: Partial<PrecomputedData>,
    ): ISerializableTransactionState {
        return this.captureState({
            params,
            type: TransactionType.FUNDING,
            ...(precomputed !== undefined ? { precomputed } : {}),
        });
    }

    /**
     * Capture state from a DeploymentTransaction
     */
    public static fromDeployment(
        params: IDeploymentParameters,
        precomputed: Partial<PrecomputedData> & {
            compiledTargetScript: string;
            randomBytes: string;
        },
    ): ISerializableTransactionState {
        return this.captureState({
            params: params as ITransactionParameters,
            type: TransactionType.DEPLOYMENT,
            precomputed,
        });
    }

    /**
     * Capture state from an InteractionTransaction
     */
    public static fromInteraction(
        params: IInteractionParameters,
        precomputed: Partial<PrecomputedData> & {
            compiledTargetScript: string;
            randomBytes: string;
        },
    ): ISerializableTransactionState {
        return this.captureState({
            params,
            type: TransactionType.INTERACTION,
            precomputed,
        });
    }

    /**
     * Capture state from a MultiSignTransaction
     */
    public static fromMultiSig(
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
    ): ISerializableTransactionState {
        return this.captureState({
            params,
            type: TransactionType.MULTI_SIG,
            ...(precomputed !== undefined ? { precomputed } : {}),
        });
    }

    /**
     * Capture state from a CustomScriptTransaction
     */
    public static fromCustomScript(
        params: ITransactionParameters & {
            scriptElements: (Uint8Array | number)[];
            witnesses: Uint8Array[];
            annex?: Uint8Array;
        },
        precomputed?: Partial<PrecomputedData>,
    ): ISerializableTransactionState {
        return this.captureState({
            params,
            type: TransactionType.CUSTOM_CODE,
            ...(precomputed !== undefined ? { precomputed } : {}),
        });
    }

    /**
     * Capture state from a CancelTransaction
     */
    public static fromCancel(
        params: ITransactionParameters & {
            compiledTargetScript: Uint8Array | string;
        },
        precomputed?: Partial<PrecomputedData>,
    ): ISerializableTransactionState {
        return this.captureState({
            params,
            type: TransactionType.CANCEL,
            ...(precomputed !== undefined ? { precomputed } : {}),
        });
    }

    /**
     * Main state capture method
     */
    private static captureState(capture: CaptureParams): ISerializableTransactionState {
        const { params, type, precomputed } = capture;

        return {
            header: this.createHeader(type, params.network, params.chainId),
            baseParams: this.extractBaseParams(params),
            utxos: this.serializeUTXOs(params.utxos),
            optionalInputs: this.serializeUTXOs(params.optionalInputs || []),
            optionalOutputs: this.serializeOutputs(params.optionalOutputs || []),
            addressRotationEnabled: params.addressRotation?.enabled ?? false,
            signerMappings: this.extractSignerMappings(params),
            typeSpecificData: this.extractTypeSpecificData(type, params),
            precomputedData: this.buildPrecomputedData(precomputed),
        };
    }

    /**
     * Create serialization header
     */
    private static createHeader(
        type: TransactionType,
        network: Network,
        chainId?: ChainId,
    ): SerializationHeader {
        return {
            formatVersion: SERIALIZATION_FORMAT_VERSION,
            consensusVersion: currentConsensus,
            transactionType: type,
            chainId: chainId ?? this.networkToChainId(network),
            timestamp: Date.now(),
        };
    }

    /**
     * Extract base parameters common to all transaction types
     */
    private static extractBaseParams(params: ITransactionParameters): SerializedBaseParams {
        const note = params.note
            ? params.note instanceof Uint8Array
                ? toHex(params.note)
                : toHex(new TextEncoder().encode(params.note))
            : undefined;

        // Handle optional priorityFee and gasSatFee (not present in MultiSig)
        const priorityFee = params.priorityFee ?? 0n;
        const gasSatFee = params.gasSatFee ?? 0n;

        return {
            from: params.from || '',
            feeRate: params.feeRate,
            priorityFee: priorityFee.toString(),
            gasSatFee: gasSatFee.toString(),
            networkName: this.networkToName(params.network),
            txVersion: params.txVersion ?? 2,
            anchor: params.anchor ?? false,
            ...(params.to !== undefined ? { to: params.to } : {}),
            ...(note !== undefined ? { note } : {}),
            ...(params.debugFees !== undefined ? { debugFees: params.debugFees } : {}),
        };
    }

    /**
     * Extract signer mappings for address rotation mode
     */
    private static extractSignerMappings(
        params: ITransactionParameters,
    ): SerializedSignerMapping[] {
        if (!params.addressRotation?.enabled) {
            return [];
        }

        const mappings: SerializedSignerMapping[] = [];
        const addressToIndices = new Map<string, number[]>();

        // Build mapping from UTXOs
        params.utxos.forEach((utxo, index) => {
            const address = utxo.scriptPubKey?.address;
            if (address) {
                const existing = addressToIndices.get(address);
                if (existing) {
                    existing.push(index);
                } else {
                    addressToIndices.set(address, [index]);
                }
            }
        });

        // Add optional inputs
        const utxoCount = params.utxos.length;
        (params.optionalInputs || []).forEach((utxo, index) => {
            const address = utxo.scriptPubKey?.address;
            if (address) {
                const existing = addressToIndices.get(address);
                if (existing) {
                    existing.push(utxoCount + index);
                } else {
                    addressToIndices.set(address, [utxoCount + index]);
                }
            }
        });

        // Convert to serializable format
        addressToIndices.forEach((indices, address) => {
            mappings.push({ address, inputIndices: indices });
        });

        return mappings;
    }

    /**
     * Extract type-specific data based on transaction type
     */
    private static extractTypeSpecificData(
        type: TransactionType,
        params: ITransactionParameters | IDeploymentParameters,
    ): TypeSpecificData {
        switch (type) {
            case TransactionType.FUNDING:
                return this.extractFundingData(params as IFundingTransactionParameters);
            case TransactionType.DEPLOYMENT:
                return this.extractDeploymentData(params as IDeploymentParameters);
            case TransactionType.INTERACTION:
                return this.extractInteractionData(params as IInteractionParameters);
            case TransactionType.MULTI_SIG:
                return this.extractMultiSigData(params);
            case TransactionType.CUSTOM_CODE:
                return this.extractCustomScriptData(params);
            case TransactionType.CANCEL:
                return this.extractCancelData(params);
            default:
                throw new Error(`Unsupported transaction type: ${type}`);
        }
    }

    private static extractFundingData(params: IFundingTransactionParameters): FundingSpecificData {
        return {
            type: TransactionType.FUNDING,
            amount: params.amount.toString(),
            splitInputsInto: params.splitInputsInto ?? 1,
        };
    }

    private static extractDeploymentData(params: IDeploymentParameters): DeploymentSpecificData {
        return {
            type: TransactionType.DEPLOYMENT,
            bytecode: toHex(params.bytecode),
            challenge: params.challenge.toRaw(),
            ...(params.calldata ? { calldata: toHex(params.calldata) } : {}),
            ...(params.revealMLDSAPublicKey !== undefined ? { revealMLDSAPublicKey: params.revealMLDSAPublicKey } : {}),
            ...(params.linkMLDSAPublicKeyToAddress !== undefined ? { linkMLDSAPublicKeyToAddress: params.linkMLDSAPublicKeyToAddress } : {}),
        };
    }

    private static extractInteractionData(params: IInteractionParameters): InteractionSpecificData {
        return {
            type: TransactionType.INTERACTION,
            calldata: toHex(params.calldata),
            challenge: params.challenge.toRaw(),
            ...(params.contract !== undefined ? { contract: params.contract } : {}),
            ...(params.loadedStorage !== undefined ? { loadedStorage: params.loadedStorage } : {}),
            ...(params.isCancellation !== undefined ? { isCancellation: params.isCancellation } : {}),
            ...(params.disableAutoRefund !== undefined ? { disableAutoRefund: params.disableAutoRefund } : {}),
            ...(params.revealMLDSAPublicKey !== undefined ? { revealMLDSAPublicKey: params.revealMLDSAPublicKey } : {}),
            ...(params.linkMLDSAPublicKeyToAddress !== undefined ? { linkMLDSAPublicKeyToAddress: params.linkMLDSAPublicKeyToAddress } : {}),
        };
    }

    private static extractMultiSigData(
        params: ITransactionParameters & {
            pubkeys?: Uint8Array[];
            minimumSignatures?: number;
            receiver?: string;
            requestedAmount?: bigint;
            refundVault?: string;
            originalInputCount?: number;
            existingPsbtBase64?: string;
        },
    ): MultiSigSpecificData {
        return {
            type: TransactionType.MULTI_SIG,
            pubkeys: (params.pubkeys || []).map((pk) => toHex(pk)),
            minimumSignatures: params.minimumSignatures || 0,
            receiver: params.receiver || '',
            requestedAmount: (params.requestedAmount || 0n).toString(),
            refundVault: params.refundVault || '',
            originalInputCount: params.originalInputCount || params.utxos.length,
            ...(params.existingPsbtBase64 !== undefined ? { existingPsbtBase64: params.existingPsbtBase64 } : {}),
        };
    }

    private static extractCustomScriptData(
        params: ITransactionParameters & {
            scriptElements?: (Uint8Array | number)[];
            witnesses?: Uint8Array[];
            annex?: Uint8Array;
        },
    ): CustomScriptSpecificData {
        const scriptElements: SerializedScriptElement[] = (params.scriptElements || []).map(
            (element) => {
                if (element instanceof Uint8Array) {
                    return {
                        elementType: 'buffer' as const,
                        value: toHex(element),
                    };
                } else {
                    return {
                        elementType: 'opcode' as const,
                        value: element,
                    };
                }
            },
        );

        return {
            type: TransactionType.CUSTOM_CODE,
            scriptElements,
            witnesses: (params.witnesses || []).map((w) => toHex(w)),
            ...(params.annex ? { annex: toHex(params.annex) } : {}),
        };
    }

    private static extractCancelData(
        params: ITransactionParameters & {
            compiledTargetScript?: Uint8Array | string;
        },
    ): CancelSpecificData {
        const script = params.compiledTargetScript;
        const scriptHex = script ? (script instanceof Uint8Array ? toHex(script) : script) : '';

        return {
            type: TransactionType.CANCEL,
            compiledTargetScript: scriptHex,
        };
    }

    /**
     * Build precomputed data object
     */
    private static buildPrecomputedData(precomputed?: Partial<PrecomputedData>): PrecomputedData {
        return {
            ...(precomputed?.compiledTargetScript !== undefined ? { compiledTargetScript: precomputed.compiledTargetScript } : {}),
            ...(precomputed?.randomBytes !== undefined ? { randomBytes: precomputed.randomBytes } : {}),
            ...(precomputed?.estimatedFees !== undefined ? { estimatedFees: precomputed.estimatedFees } : {}),
            ...(precomputed?.contractSeed !== undefined ? { contractSeed: precomputed.contractSeed } : {}),
            ...(precomputed?.contractAddress !== undefined ? { contractAddress: precomputed.contractAddress } : {}),
        };
    }

    /**
     * Serialize UTXOs array
     */
    private static serializeUTXOs(utxos: UTXO[]): SerializedUTXO[] {
        return utxos.map((utxo): SerializedUTXO => {
            const redeemScript = utxo.redeemScript
                ? utxo.redeemScript instanceof Uint8Array
                    ? toHex(utxo.redeemScript)
                    : utxo.redeemScript
                : undefined;
            const witnessScript = utxo.witnessScript
                ? utxo.witnessScript instanceof Uint8Array
                    ? toHex(utxo.witnessScript)
                    : utxo.witnessScript
                : undefined;
            const nonWitnessUtxo = utxo.nonWitnessUtxo
                ? utxo.nonWitnessUtxo instanceof Uint8Array
                    ? toHex(utxo.nonWitnessUtxo)
                    : utxo.nonWitnessUtxo
                : undefined;
            return {
                transactionId: utxo.transactionId,
                outputIndex: utxo.outputIndex,
                value: utxo.value.toString(),
                scriptPubKeyHex: utxo.scriptPubKey.hex,
                ...(utxo.scriptPubKey.address !== undefined ? { scriptPubKeyAddress: utxo.scriptPubKey.address } : {}),
                ...(redeemScript !== undefined ? { redeemScript } : {}),
                ...(witnessScript !== undefined ? { witnessScript } : {}),
                ...(nonWitnessUtxo !== undefined ? { nonWitnessUtxo } : {}),
            };
        });
    }

    /**
     * Serialize outputs array
     */
    private static serializeOutputs(outputs: PsbtOutputExtended[]): SerializedOutput[] {
        return outputs.map((output): SerializedOutput => {
            const address = 'address' in output ? output.address : undefined;
            const script = 'script' in output ? output.script : undefined;
            const scriptHex = script ? toHex(script) : undefined;
            const tapInternalKeyHex = output.tapInternalKey ? toHex(output.tapInternalKey) : undefined;

            return {
                value: Number(output.value),
                ...(address !== undefined ? { address } : {}),
                ...(scriptHex !== undefined ? { script: scriptHex } : {}),
                ...(tapInternalKeyHex !== undefined ? { tapInternalKey: tapInternalKeyHex } : {}),
            };
        });
    }

    /**
     * Convert network to name string
     */
    private static networkToName(network: Network): 'mainnet' | 'testnet' | 'regtest' {
        if (network.bech32 === 'bc') return 'mainnet';
        if (network.bech32 === 'tb') return 'testnet';
        return 'regtest';
    }

    /**
     * Convert network to chain ID
     */
    private static networkToChainId(_network: Network): ChainId {
        // Default to Bitcoin chain
        return ChainId.Bitcoin;
    }
}
