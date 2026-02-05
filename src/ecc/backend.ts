import { createNobleBackend, type CryptoBackend } from '@btc-vision/ecpair';
import { type EccLib, initEccLib } from '@btc-vision/bitcoin';

/**
 * Shared noble-curves backend for all EC operations.
 * Instantiated once and reused across the entire library.
 */
export const backend: CryptoBackend = createNobleBackend();

/**
 * EccLib is now a type alias for CryptoBackend.
 * The backend can be used directly.
 */
export const eccLib: EccLib = backend;

// Initialize the ECC library once at module load
initEccLib(eccLib);
