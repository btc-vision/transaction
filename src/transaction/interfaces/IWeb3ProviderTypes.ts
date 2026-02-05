import type { IDeploymentParameters, IInteractionParameters } from './ITransactionParameters.js';
import type { ICustomTransactionParameters } from './ICustomTransactionParameters.js';
import type { ICancelTransactionParameters } from './ICancelTransactionParameters.js';
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
