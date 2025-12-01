import { Unisat } from './Unisat.js';
import { Web3Provider } from '../Web3Provider.js';

/**
 * OPWallet interface extending Unisat with ML-DSA (FIPS 204) support
 *
 * SECURITY NOTE: All methods only expose public keys and signatures.
 * Private keys are NEVER exposed through this interface.
 */
export interface OPWallet extends Unisat {
    web3: Web3Provider;
}

/**
 * Type guard to check if a wallet supports OPWallet features
 */
export function isOPWallet(wallet: unknown): wallet is OPWallet {
    return (
        typeof wallet === 'object' &&
        wallet !== null &&
        'web3' in wallet &&
        typeof wallet.web3 === 'object' &&
        'getMLDSAPublicKey' in (wallet.web3 as Web3Provider) &&
        'signMLDSAMessage' in (wallet.web3 as Web3Provider)
    );
}
