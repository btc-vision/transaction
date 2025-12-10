import { Network, networks, PsbtOutputExtended } from '@btc-vision/bitcoin';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ChainId } from '../../network/ChainId.js';
import { currentConsensus } from '../../consensus/ConsensusConfig.js';
import { TransactionType } from '../enums/TransactionType.js';
import {
    ISerializableTransactionState,
    PrecomputedData,
    SerializationHeader,
    SerializedBaseParams,
    SerializedOutput,
    SerializedSignerMapping,
    SerializedUTXO,
    SERIALIZATION_FORMAT_VERSION,
} from './interfaces/ISerializableState.js';
import {
    CancelSpecificData,
    CustomScriptSpecificData,
    DeploymentSpecificData,
    FundingSpecificData,
    InteractionSpecificData,
    MultiSigSpecificData,
    SerializedScriptElement,
    TypeSpecificData,
} from './interfaces/ITypeSpecificData.js';
import {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
    LoadedStorage,
} from '../interfaces/ITransactionParameters.js';
import { ChallengeSolution } from '../../epoch/ChallengeSolution.js';

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
            precomputed,
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
            pubkeys: Buffer[];
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
            precomputed,
        });
    }

    /**
     * Capture state from a CustomScriptTransaction
     */
    public static fromCustomScript(
        params: ITransactionParameters & {
            scriptElements: (Buffer | number)[];
            witnesses: Buffer[];
            annex?: Buffer;
        },
        precomputed?: Partial<PrecomputedData>,
    ): ISerializableTransactionState {
        return this.captureState({
            params,
            type: TransactionType.CUSTOM_CODE,
            precomputed,
        });
    }

    /**
     * Capture state from a CancelTransaction
     */
    public static fromCancel(
        params: ITransactionParameters & {
            compiledTargetScript: Buffer | string;
        },
        precomputed?: Partial<PrecomputedData>,
    ): ISerializableTransactionState {
        return this.captureState({
            params,
            type: TransactionType.CANCEL,
            precomputed,
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
            ? Buffer.isBuffer(params.note)
                ? params.note.toString('hex')
                : Buffer.from(params.note).toString('hex')
            : undefined;

        return {
            from: params.from || '',
            to: params.to,
            feeRate: params.feeRate,
            priorityFee: params.priorityFee.toString(),
            gasSatFee: params.gasSatFee.toString(),
            networkName: this.networkToName(params.network),
            txVersion: params.txVersion ?? 2,
            note,
            anchor: params.anchor ?? false,
            debugFees: params.debugFees,
        };
    }

    /**
     * Extract signer mappings for address rotation mode
     */
    private static extractSignerMappings(params: ITransactionParameters): SerializedSignerMapping[] {
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
        params: ITransactionParameters,
    ): TypeSpecificData {
        switch (type) {
            case TransactionType.FUNDING:
                return this.extractFundingData(params as IFundingTransactionParameters);
            case TransactionType.DEPLOYMENT:
                return this.extractDeploymentData(params as unknown as IDeploymentParameters);
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
            bytecode: params.bytecode.toString('hex'),
            calldata: params.calldata?.toString('hex'),
            challenge: params.challenge.toRaw(),
            revealMLDSAPublicKey: params.revealMLDSAPublicKey,
            linkMLDSAPublicKeyToAddress: params.linkMLDSAPublicKeyToAddress,
        };
    }

    private static extractInteractionData(params: IInteractionParameters): InteractionSpecificData {
        return {
            type: TransactionType.INTERACTION,
            calldata: params.calldata.toString('hex'),
            contract: params.contract,
            challenge: params.challenge.toRaw(),
            loadedStorage: params.loadedStorage,
            isCancellation: params.isCancellation,
            disableAutoRefund: params.disableAutoRefund,
            revealMLDSAPublicKey: params.revealMLDSAPublicKey,
            linkMLDSAPublicKeyToAddress: params.linkMLDSAPublicKeyToAddress,
        };
    }

    private static extractMultiSigData(
        params: ITransactionParameters & {
            pubkeys?: Buffer[];
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
            pubkeys: (params.pubkeys || []).map((pk) => pk.toString('hex')),
            minimumSignatures: params.minimumSignatures || 0,
            receiver: params.receiver || '',
            requestedAmount: (params.requestedAmount || 0n).toString(),
            refundVault: params.refundVault || '',
            originalInputCount: params.originalInputCount || params.utxos.length,
            existingPsbtBase64: params.existingPsbtBase64,
        };
    }

    private static extractCustomScriptData(
        params: ITransactionParameters & {
            scriptElements?: (Buffer | number)[];
            witnesses?: Buffer[];
            annex?: Buffer;
        },
    ): CustomScriptSpecificData {
        const scriptElements: SerializedScriptElement[] = (params.scriptElements || []).map(
            (element) => {
                if (Buffer.isBuffer(element)) {
                    return {
                        elementType: 'buffer' as const,
                        value: element.toString('hex'),
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
            witnesses: (params.witnesses || []).map((w) => w.toString('hex')),
            annex: params.annex?.toString('hex'),
        };
    }

    private static extractCancelData(
        params: ITransactionParameters & {
            compiledTargetScript?: Buffer | string;
        },
    ): CancelSpecificData {
        const script = params.compiledTargetScript;
        const scriptHex = script
            ? Buffer.isBuffer(script)
                ? script.toString('hex')
                : script
            : '';

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
            compiledTargetScript: precomputed?.compiledTargetScript,
            randomBytes: precomputed?.randomBytes,
            estimatedFees: precomputed?.estimatedFees,
            contractSeed: precomputed?.contractSeed,
            contractAddress: precomputed?.contractAddress,
        };
    }

    /**
     * Serialize UTXOs array
     */
    private static serializeUTXOs(utxos: UTXO[]): SerializedUTXO[] {
        return utxos.map((utxo) => ({
            transactionId: utxo.transactionId,
            outputIndex: utxo.outputIndex,
            value: utxo.value.toString(),
            scriptPubKeyHex: utxo.scriptPubKey.hex,
            scriptPubKeyAddress: utxo.scriptPubKey.address,
            redeemScript: utxo.redeemScript
                ? Buffer.isBuffer(utxo.redeemScript)
                    ? utxo.redeemScript.toString('hex')
                    : utxo.redeemScript
                : undefined,
            witnessScript: utxo.witnessScript
                ? Buffer.isBuffer(utxo.witnessScript)
                    ? utxo.witnessScript.toString('hex')
                    : utxo.witnessScript
                : undefined,
            nonWitnessUtxo: utxo.nonWitnessUtxo
                ? Buffer.isBuffer(utxo.nonWitnessUtxo)
                    ? utxo.nonWitnessUtxo.toString('hex')
                    : utxo.nonWitnessUtxo
                : undefined,
        }));
    }

    /**
     * Serialize outputs array
     */
    private static serializeOutputs(outputs: PsbtOutputExtended[]): SerializedOutput[] {
        return outputs.map((output) => {
            // PsbtOutputExtended is a union - handle both address and script variants
            const address = 'address' in output ? output.address : undefined;
            const script = 'script' in output ? output.script : undefined;

            return {
                value: output.value,
                address,
                script: script ? script.toString('hex') : undefined,
                tapInternalKey: output.tapInternalKey
                    ? output.tapInternalKey.toString('hex')
                    : undefined,
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
    private static networkToChainId(network: Network): ChainId {
        // Default to Bitcoin chain
        return ChainId.Bitcoin;
    }
}
