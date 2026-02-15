import {
    fromHex,
    type Network,
    networks,
    type PsbtOutputExtended,
    type Script,
    type Signer,
    type Stack,
    toSatoshi,
} from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type { QuantumBIP32Interface } from '@btc-vision/bip32';
import type { UTXO } from '../../utxo/interfaces/IUTXO.js';
import type { AddressRotationConfig, SignerMap } from '../../signer/AddressRotation.js';
import { ChallengeSolution } from '../../epoch/ChallengeSolution.js';
import { TransactionType } from '../enums/TransactionType.js';
import { TransactionBuilder } from '../builders/TransactionBuilder.js';
import { FundingTransaction } from '../builders/FundingTransaction.js';
import { DeploymentTransaction } from '../builders/DeploymentTransaction.js';
import { InteractionTransaction } from '../builders/InteractionTransaction.js';
import { MultiSignTransaction } from '../builders/MultiSignTransaction.js';
import { CustomScriptTransaction } from '../builders/CustomScriptTransaction.js';
import { CancelTransaction } from '../builders/CancelTransaction.js';
import type {
    ISerializableTransactionState,
    SerializedOutput,
    SerializedUTXO,
} from './interfaces/ISerializableState.js';
import {
    type CancelSpecificData,
    type CustomScriptSpecificData,
    type DeploymentSpecificData,
    type FundingSpecificData,
    type InteractionSpecificData,
    isCancelSpecificData,
    isCustomScriptSpecificData,
    isDeploymentSpecificData,
    isFundingSpecificData,
    isInteractionSpecificData,
    isMultiSigSpecificData,
    type MultiSigSpecificData,
} from './interfaces/ITypeSpecificData.js';
import type {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
} from '../interfaces/ITransactionParameters.js';
import type { SupportedTransactionVersion } from '../interfaces/ITweakedTransactionData.js';

/**
 * Options for reconstructing a transaction from serialized state
 */
export interface ReconstructionOptions {
    /** Primary signer (used for normal mode or as default in rotation mode) */
    signer: Signer | UniversalSigner;

    /** Optional: Override fee rate for fee bumping */
    newFeeRate?: number;

    /** Optional: Override priority fee */
    newPriorityFee?: bigint;

    /** Optional: Override gas sat fee */
    newGasSatFee?: bigint;

    /** Signer map for address rotation mode (keyed by address) */
    signerMap?: SignerMap;

    /** MLDSA signer (for quantum-resistant features) */
    mldsaSigner?: QuantumBIP32Interface | null;
}

/**
 * Reconstructs transaction builders from serialized state.
 * Supports fee bumping by allowing parameter overrides during reconstruction.
 */
export class TransactionReconstructor {
    /**
     * Reconstruct and optionally rebuild transaction with new parameters
     * @param state - Serialized transaction state
     * @param options - Signer(s) and optional fee overrides
     * @returns Reconstructed transaction builder ready for signing
     */
    public static reconstruct(
        state: ISerializableTransactionState,
        options: ReconstructionOptions,
    ): TransactionBuilder<TransactionType> {
        const network = this.nameToNetwork(state.baseParams.networkName);
        const utxos = this.deserializeUTXOs(state.utxos);
        const optionalInputs = this.deserializeUTXOs(state.optionalInputs);
        const optionalOutputs = this.deserializeOutputs(state.optionalOutputs);

        // Build address rotation config
        const addressRotation = this.buildAddressRotationConfig(
            state.addressRotationEnabled,
            options.signerMap,
        );

        // Apply fee overrides
        const feeRate = options.newFeeRate ?? state.baseParams.feeRate;
        const priorityFee = options.newPriorityFee ?? BigInt(state.baseParams.priorityFee);
        const gasSatFee = options.newGasSatFee ?? BigInt(state.baseParams.gasSatFee);

        // Build base params
        const baseParams: ITransactionParameters = {
            signer: options.signer,
            mldsaSigner: options.mldsaSigner ?? null,
            network,
            utxos,
            optionalInputs,
            optionalOutputs,
            from: state.baseParams.from,
            feeRate,
            priorityFee,
            gasSatFee,
            anchor: state.baseParams.anchor,
            ...(state.header.chainId !== undefined ? { chainId: state.header.chainId } : {}),
            ...(state.baseParams.to !== undefined ? { to: state.baseParams.to } : {}),
            ...(state.baseParams.txVersion !== undefined
                ? { txVersion: state.baseParams.txVersion as SupportedTransactionVersion }
                : {}),
            ...(state.baseParams.note !== undefined
                ? { note: fromHex(state.baseParams.note) }
                : {}),
            ...(state.baseParams.debugFees !== undefined
                ? { debugFees: state.baseParams.debugFees }
                : {}),
            ...(addressRotation !== undefined ? { addressRotation } : {}),
            ...(state.precomputedData.estimatedFees !== undefined
                ? { estimatedFees: BigInt(state.precomputedData.estimatedFees) }
                : {}),
            ...(state.precomputedData.compiledTargetScript !== undefined
                ? { compiledTargetScript: fromHex(state.precomputedData.compiledTargetScript) }
                : {}),
        };

        // Dispatch based on transaction type
        const typeData = state.typeSpecificData;

        if (isFundingSpecificData(typeData)) {
            return this.reconstructFunding(baseParams, typeData);
        } else if (isDeploymentSpecificData(typeData)) {
            return this.reconstructDeployment(baseParams, typeData, state);
        } else if (isInteractionSpecificData(typeData)) {
            return this.reconstructInteraction(baseParams, typeData, state);
        } else if (isMultiSigSpecificData(typeData)) {
            return this.reconstructMultiSig(baseParams, typeData);
        } else if (isCustomScriptSpecificData(typeData)) {
            return this.reconstructCustomScript(baseParams, typeData, state);
        } else if (isCancelSpecificData(typeData)) {
            return this.reconstructCancel(baseParams, typeData);
        }

        throw new Error(`Unsupported transaction type: ${state.header.transactionType}`);
    }

    /**
     * Reconstruct a FundingTransaction
     */
    private static reconstructFunding(
        baseParams: ITransactionParameters,
        data: FundingSpecificData,
    ): FundingTransaction {
        const params: IFundingTransactionParameters = {
            ...baseParams,
            amount: BigInt(data.amount),
            splitInputsInto: data.splitInputsInto,
        };

        return new FundingTransaction(params);
    }

    /**
     * Reconstruct a DeploymentTransaction
     */
    private static reconstructDeployment(
        baseParams: ITransactionParameters,
        data: DeploymentSpecificData,
        state: ISerializableTransactionState,
    ): DeploymentTransaction {
        const challenge = new ChallengeSolution(data.challenge);

        const params: IDeploymentParameters = {
            ...baseParams,
            bytecode: fromHex(data.bytecode),
            challenge,
            ...(data.calldata !== undefined ? { calldata: fromHex(data.calldata) } : {}),
            ...(state.precomputedData.randomBytes !== undefined
                ? { randomBytes: fromHex(state.precomputedData.randomBytes) }
                : {}),
            ...(data.revealMLDSAPublicKey !== undefined
                ? { revealMLDSAPublicKey: data.revealMLDSAPublicKey }
                : {}),
            ...(data.linkMLDSAPublicKeyToAddress !== undefined
                ? { linkMLDSAPublicKeyToAddress: data.linkMLDSAPublicKeyToAddress }
                : {}),
        };

        return new DeploymentTransaction(params);
    }

    /**
     * Reconstruct an InteractionTransaction
     */
    private static reconstructInteraction(
        baseParams: ITransactionParameters,
        data: InteractionSpecificData,
        state: ISerializableTransactionState,
    ): InteractionTransaction {
        const challenge = new ChallengeSolution(data.challenge);

        if (!baseParams.to) {
            throw new Error('InteractionTransaction requires a "to" address');
        }

        const params: IInteractionParameters = {
            ...baseParams,
            to: baseParams.to,
            calldata: fromHex(data.calldata),
            challenge,
            ...(data.contract !== undefined ? { contract: data.contract } : {}),
            ...(state.precomputedData.randomBytes !== undefined
                ? { randomBytes: fromHex(state.precomputedData.randomBytes) }
                : {}),
            ...(data.loadedStorage !== undefined ? { loadedStorage: data.loadedStorage } : {}),
            ...(data.isCancellation !== undefined ? { isCancellation: data.isCancellation } : {}),
            ...(data.disableAutoRefund !== undefined
                ? { disableAutoRefund: data.disableAutoRefund }
                : {}),
            ...(data.revealMLDSAPublicKey !== undefined
                ? { revealMLDSAPublicKey: data.revealMLDSAPublicKey }
                : {}),
            ...(data.linkMLDSAPublicKeyToAddress !== undefined
                ? { linkMLDSAPublicKeyToAddress: data.linkMLDSAPublicKeyToAddress }
                : {}),
        };

        return new InteractionTransaction(params);
    }

    /**
     * Reconstruct a MultiSignTransaction
     */
    private static reconstructMultiSig(
        baseParams: ITransactionParameters,
        data: MultiSigSpecificData,
    ): MultiSignTransaction {
        const pubkeys = data.pubkeys.map((pk) => fromHex(pk));

        // If there's an existing PSBT, use fromBase64 to preserve partial signatures
        if (data.existingPsbtBase64) {
            return MultiSignTransaction.fromBase64({
                mldsaSigner: baseParams.mldsaSigner,
                network: baseParams.network,
                utxos: baseParams.utxos,
                feeRate: baseParams.feeRate,
                pubkeys,
                minimumSignatures: data.minimumSignatures,
                receiver: data.receiver,
                requestedAmount: BigInt(data.requestedAmount),
                refundVault: data.refundVault,
                psbt: data.existingPsbtBase64,
                ...(baseParams.chainId !== undefined ? { chainId: baseParams.chainId } : {}),
                ...(baseParams.optionalInputs !== undefined
                    ? { optionalInputs: baseParams.optionalInputs }
                    : {}),
                ...(baseParams.optionalOutputs !== undefined
                    ? { optionalOutputs: baseParams.optionalOutputs }
                    : {}),
            });
        }

        // No existing PSBT - create fresh transaction
        const params = {
            mldsaSigner: baseParams.mldsaSigner,
            network: baseParams.network,
            utxos: baseParams.utxos,
            feeRate: baseParams.feeRate,
            pubkeys,
            minimumSignatures: data.minimumSignatures,
            receiver: data.receiver,
            requestedAmount: BigInt(data.requestedAmount),
            refundVault: data.refundVault,
            ...(baseParams.chainId !== undefined ? { chainId: baseParams.chainId } : {}),
            ...(baseParams.optionalInputs !== undefined
                ? { optionalInputs: baseParams.optionalInputs }
                : {}),
            ...(baseParams.optionalOutputs !== undefined
                ? { optionalOutputs: baseParams.optionalOutputs }
                : {}),
        };

        return new MultiSignTransaction(params);
    }

    /**
     * Reconstruct a CustomScriptTransaction
     */
    private static reconstructCustomScript(
        baseParams: ITransactionParameters,
        data: CustomScriptSpecificData,
        state: ISerializableTransactionState,
    ): CustomScriptTransaction {
        // Convert serialized elements to (Uint8Array | Stack)[]
        const scriptElements: (Uint8Array | Stack)[] = data.scriptElements.map((el) => {
            if (el.elementType === 'buffer') {
                return fromHex(el.value as string);
            }
            // Opcodes stored as numbers - wrap in array for Stack type
            return [el.value as number] as Stack;
        });

        const witnesses = data.witnesses.map((w) => fromHex(w));

        if (!baseParams.to) {
            throw new Error('CustomScriptTransaction requires a "to" address');
        }

        const params = {
            ...baseParams,
            to: baseParams.to,
            script: scriptElements,
            witnesses,
            ...(data.annex !== undefined ? { annex: fromHex(data.annex) } : {}),
            ...(state.precomputedData.randomBytes !== undefined
                ? { randomBytes: fromHex(state.precomputedData.randomBytes) }
                : {}),
        };

        return new CustomScriptTransaction(params);
    }

    /**
     * Reconstruct a CancelTransaction
     */
    private static reconstructCancel(
        baseParams: ITransactionParameters,
        data: CancelSpecificData,
    ): CancelTransaction {
        const params = {
            ...baseParams,
            compiledTargetScript: fromHex(data.compiledTargetScript),
        };

        return new CancelTransaction(params);
    }

    /**
     * Build address rotation config from options
     */
    private static buildAddressRotationConfig(
        enabled: boolean,
        signerMap?: SignerMap,
    ): AddressRotationConfig | undefined {
        if (!enabled) {
            return undefined;
        }

        if (!signerMap || signerMap.size === 0) {
            throw new Error(
                'Address rotation enabled but no signerMap provided in reconstruction options',
            );
        }

        return {
            enabled: true,
            signerMap,
        };
    }

    /**
     * Deserialize UTXOs from serialized format
     */
    private static deserializeUTXOs(serialized: SerializedUTXO[]): UTXO[] {
        return serialized.map((s) => {
            const utxo: UTXO = {
                transactionId: s.transactionId,
                outputIndex: s.outputIndex,
                value: BigInt(s.value),
                scriptPubKey: {
                    hex: s.scriptPubKeyHex,
                    ...(s.scriptPubKeyAddress !== undefined
                        ? { address: s.scriptPubKeyAddress }
                        : {}),
                },
            };
            if (s.redeemScript !== undefined) utxo.redeemScript = fromHex(s.redeemScript);
            if (s.witnessScript !== undefined) utxo.witnessScript = fromHex(s.witnessScript);
            if (s.nonWitnessUtxo !== undefined) utxo.nonWitnessUtxo = fromHex(s.nonWitnessUtxo);
            return utxo;
        });
    }

    /**
     * Deserialize outputs from serialized format
     */
    private static deserializeOutputs(serialized: SerializedOutput[]): PsbtOutputExtended[] {
        return serialized.map((s): PsbtOutputExtended => {
            const base = { value: toSatoshi(BigInt(s.value)) };
            const tapKey =
                s.tapInternalKey !== undefined ? { tapInternalKey: fromHex(s.tapInternalKey) } : {};

            // PsbtOutputExtended is a union type - either has address OR script, not both
            if (s.address) {
                return { ...base, address: s.address, ...tapKey };
            } else if (s.script) {
                return { ...base, script: fromHex(s.script) as Script, ...tapKey };
            } else {
                // Fallback - shouldn't happen with valid data
                return { ...base, address: '', ...tapKey };
            }
        });
    }

    /**
     * Convert network name to Network object
     */
    private static nameToNetwork(name: 'mainnet' | 'testnet' | 'regtest'): Network {
        switch (name) {
            case 'mainnet':
                return networks.bitcoin;
            case 'testnet':
                return networks.testnet;
            case 'regtest':
                return networks.regtest;
            default:
                throw new Error(`Unknown network: ${name}`);
        }
    }
}
