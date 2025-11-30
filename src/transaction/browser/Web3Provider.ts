import { IDeploymentParameters, IInteractionParameters, } from '../interfaces/ITransactionParameters.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { CancelledTransaction, DeploymentResult, InteractionResponse } from '../TransactionFactory';
import { ICustomTransactionParameters } from '../builders/CustomScriptTransaction.js';
import { ICancelTransactionParameters } from '../builders/CancelTransaction.js';
import { MLDSASecurityLevel } from '@btc-vision/bip32';

export type InteractionParametersWithoutSigner = Omit<
    IInteractionParameters,
    'signer' | 'challenge' | 'mldsaSigner'
>;

export type IDeploymentParametersWithoutSigner = Omit<
    IDeploymentParameters,
    'signer' | 'network' | 'challenge' | 'mldsaSigner'
>;

export type ICustomTransactionWithoutSigner = Omit<
    ICustomTransactionParameters,
    'signer' | 'challenge' | 'mldsaSigner'
>;

export type ICancelTransactionParametersWithoutSigner = Omit<
    ICancelTransactionParameters,
    'signer' | 'challenge' | 'network' | 'mldsaSigner'
>;

export interface BroadcastTransactionOptions {
    raw: string;
    psbt: boolean;
}

export interface BroadcastedTransaction {
    /** Whether the transaction was successfully broadcasted. */
    readonly success: boolean;

    /**
     * The result of the broadcasted transaction.
     */
    readonly result?: string;

    /**
     * The error message if the transaction was not successfully broadcasted.
     */
    readonly error?: string;

    /**
     * The number of peers that the transaction was broadcasted to.
     */
    readonly peers?: number;
}

/**
 * ML-DSA signature result
 */
export interface MLDSASignature {
    /**
     * The ML-DSA signature in hex format
     */
    readonly signature: string;

    /**
     * The ML-DSA public key used for signing in hex format
     */
    readonly publicKey: string;

    /**
     * The security level used (44, 65, or 87)
     */
    readonly securityLevel: MLDSASecurityLevel;

    /**
     * The message hash that was signed
     */
    readonly messageHash: string;
}

export interface Web3Provider {
    signInteraction(
        interactionParameters: InteractionParametersWithoutSigner,
    ): Promise<InteractionResponse>;

    signAndBroadcastInteraction(
        interactionParameters: InteractionParametersWithoutSigner,
    ): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[], string]>;

    cancelTransaction(
        params: ICancelTransactionParametersWithoutSigner,
    ): Promise<CancelledTransaction>;

    customTransaction(params: ICustomTransactionWithoutSigner): Promise<BroadcastedTransaction>;

    deployContract(params: IDeploymentParametersWithoutSigner): Promise<DeploymentResult>;

    broadcast(transactions: BroadcastTransactionOptions[]): Promise<BroadcastedTransaction[]>;

    /**
     * Sign a message using Schnorr signature
     * @param message - Hexadecimal string message to sign
     * @returns The Schnorr signature in hex format
     * @throws {Error} If signing fails or wallet is not connected
     */
    signSchnorr(message: string): Promise<string>;

    /**
     * Get the ML-DSA public key for the current account
     *
     * @returns The ML-DSA public key in hex format (never exposes private keys)
     * @throws {Error} If the wallet is not connected
     */
    getMLDSAPublicKey(): Promise<string>;

    /**
     * Sign a message using ML-DSA signature
     *
     * @param message - The message to sign as a hexadecimal string
     * @returns The ML-DSA signature
     * @throws {Error} If signing fails or wallet is not connected
     */
    signMLDSAMessage(message: string): Promise<MLDSASignature>;

    /**
     * Verify an ML-DSA signature
     *
     * @param message - The original message, hexadecimal string
     * @param signature - The ML-DSA signature to verify
     * @returns True if the signature is valid
     */
    verifyMLDSASignature(message: string, signature: MLDSASignature): Promise<boolean>;
}
