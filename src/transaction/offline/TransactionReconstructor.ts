import { fromHex, Network, networks, PsbtOutputExtended, Signer, Stack } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import { QuantumBIP32Interface } from '@btc-vision/bip32';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { AddressRotationConfig, SignerMap } from '../../signer/AddressRotation.js';
import { ChallengeSolution } from '../../epoch/ChallengeSolution.js';
import { TransactionType } from '../enums/TransactionType.js';
import { TransactionBuilder } from '../builders/TransactionBuilder.js';
import { FundingTransaction } from '../builders/FundingTransaction.js';
import { DeploymentTransaction } from '../builders/DeploymentTransaction.js';
import { InteractionTransaction } from '../builders/InteractionTransaction.js';
import { MultiSignTransaction } from '../builders/MultiSignTransaction.js';
import { CustomScriptTransaction } from '../builders/CustomScriptTransaction.js';
import { CancelTransaction } from '../builders/CancelTransaction.js';
import { ISerializableTransactionState, SerializedOutput, SerializedUTXO, } from './interfaces/ISerializableState.js';
import {
    CancelSpecificData,
    CustomScriptSpecificData,
    DeploymentSpecificData,
    FundingSpecificData,
    InteractionSpecificData,
    isCancelSpecificData,
    isCustomScriptSpecificData,
    isDeploymentSpecificData,
    isFundingSpecificData,
    isInteractionSpecificData,
    isMultiSigSpecificData,
    MultiSigSpecificData,
} from './interfaces/ITypeSpecificData.js';
import {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
} from '../interfaces/ITransactionParameters.js';
import { SupportedTransactionVersion } from '../interfaces/ITweakedTransactionData.js';

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
            chainId: state.header.chainId,
            utxos,
            optionalInputs,
            optionalOutputs,
            from: state.baseParams.from,
            to: state.baseParams.to,
            feeRate,
            priorityFee,
            gasSatFee,
            txVersion: state.baseParams.txVersion as SupportedTransactionVersion,
            note: state.baseParams.note ? fromHex(state.baseParams.note) : undefined,
            anchor: state.baseParams.anchor,
            debugFees: state.baseParams.debugFees,
            addressRotation,
            estimatedFees: state.precomputedData.estimatedFees
                ? BigInt(state.precomputedData.estimatedFees)
                : undefined,
            compiledTargetScript: state.precomputedData.compiledTargetScript
                ? fromHex(state.precomputedData.compiledTargetScript)
                : undefined,
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
            calldata: data.calldata ? fromHex(data.calldata) : undefined,
            challenge,
            randomBytes: state.precomputedData.randomBytes
                ? fromHex(state.precomputedData.randomBytes)
                : undefined,
            revealMLDSAPublicKey: data.revealMLDSAPublicKey,
            linkMLDSAPublicKeyToAddress: data.linkMLDSAPublicKeyToAddress,
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
            contract: data.contract,
            challenge,
            randomBytes: state.precomputedData.randomBytes
                ? fromHex(state.precomputedData.randomBytes)
                : undefined,
            loadedStorage: data.loadedStorage,
            isCancellation: data.isCancellation,
            disableAutoRefund: data.disableAutoRefund,
            revealMLDSAPublicKey: data.revealMLDSAPublicKey,
            linkMLDSAPublicKeyToAddress: data.linkMLDSAPublicKeyToAddress,
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
                chainId: baseParams.chainId,
                utxos: baseParams.utxos,
                optionalInputs: baseParams.optionalInputs,
                optionalOutputs: baseParams.optionalOutputs,
                feeRate: baseParams.feeRate,
                pubkeys,
                minimumSignatures: data.minimumSignatures,
                receiver: data.receiver,
                requestedAmount: BigInt(data.requestedAmount),
                refundVault: data.refundVault,
                psbt: data.existingPsbtBase64,
            });
        }

        // No existing PSBT - create fresh transaction
        const params = {
            mldsaSigner: baseParams.mldsaSigner,
            network: baseParams.network,
            chainId: baseParams.chainId,
            utxos: baseParams.utxos,
            optionalInputs: baseParams.optionalInputs,
            optionalOutputs: baseParams.optionalOutputs,
            feeRate: baseParams.feeRate,
            pubkeys,
            minimumSignatures: data.minimumSignatures,
            receiver: data.receiver,
            requestedAmount: BigInt(data.requestedAmount),
            refundVault: data.refundVault,
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
        const annex = data.annex ? fromHex(data.annex) : undefined;

        if (!baseParams.to) {
            throw new Error('CustomScriptTransaction requires a "to" address');
        }

        const params = {
            ...baseParams,
            to: baseParams.to,
            script: scriptElements,
            witnesses,
            annex,
            randomBytes: state.precomputedData.randomBytes
                ? fromHex(state.precomputedData.randomBytes)
                : undefined,
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
        return serialized.map((s) => ({
            transactionId: s.transactionId,
            outputIndex: s.outputIndex,
            value: BigInt(s.value),
            scriptPubKey: {
                hex: s.scriptPubKeyHex,
                address: s.scriptPubKeyAddress,
            },
            redeemScript: s.redeemScript ? fromHex(s.redeemScript) : undefined,
            witnessScript: s.witnessScript ? fromHex(s.witnessScript) : undefined,
            nonWitnessUtxo: s.nonWitnessUtxo ? fromHex(s.nonWitnessUtxo) : undefined,
        }));
    }

    /**
     * Deserialize outputs from serialized format
     */
    private static deserializeOutputs(serialized: SerializedOutput[]): PsbtOutputExtended[] {
        return serialized.map((s): PsbtOutputExtended => {
            const tapInternalKey = s.tapInternalKey
                ? fromHex(s.tapInternalKey)
                : undefined;

            // PsbtOutputExtended is a union type - either has address OR script, not both
            if (s.address) {
                return {
                    value: s.value,
                    address: s.address,
                    tapInternalKey,
                };
            } else if (s.script) {
                return {
                    value: s.value,
                    script: fromHex(s.script),
                    tapInternalKey,
                };
            } else {
                // Fallback - shouldn't happen with valid data
                return {
                    value: s.value,
                    address: '',
                    tapInternalKey,
                };
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
