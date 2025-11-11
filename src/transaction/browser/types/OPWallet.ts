import { Unisat, UnisatChainInfo } from './Unisat.js';
import { MLDSASecurityLevel } from '@btc-vision/bip32';

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


/**
 * OPWallet interface extending Unisat with ML-DSA (FIPS 204) support
 *
 * SECURITY NOTE: All methods only expose public keys and signatures.
 * Private keys are NEVER exposed through this interface.
 */
export interface OPWallet extends Unisat {
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
     * @param message - The message to sign
     * @returns The ML-DSA signature
     * @throws {Error} If signing fails or wallet is not connected
     */
    signMLDSAMessage(message: string): Promise<MLDSASignature>;

    /**
     * Verify an ML-DSA signature
     *
     * @param message - The original message
     * @param signature - The ML-DSA signature to verify
     * @returns True if the signature is valid
     */
    verifyMLDSASignature(message: string, signature: MLDSASignature): Promise<boolean>;
}

/**
 * Type guard to check if a wallet supports OPWallet features
 */
export function isOPWallet(wallet: unknown): wallet is OPWallet {
    return (
        typeof wallet === 'object' &&
        wallet !== null &&
        'getMLDSAPublicKey' in wallet &&
        'signMLDSAMessage' in wallet
    );
}
