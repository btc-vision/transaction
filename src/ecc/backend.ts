import { createNobleBackend, type CryptoBackend } from '@btc-vision/ecpair';
import { type EccLib, initEccLib } from '@btc-vision/bitcoin';

/**
 * Shared noble-curves backend for all EC operations.
 * Instantiated once and reused across the entire library.
 */
export const backend: CryptoBackend = createNobleBackend();

/**
 * EccLib adapter that bridges CryptoBackend to the EccLib interface
 * required by initEccLib(). CryptoBackend uses isPoint() for SEC1 points
 * while EccLib needs isXOnlyPoint() for 32-byte x-only keys.
 */
export const eccLib: EccLib = {
    isXOnlyPoint(p: Uint8Array): boolean {
        if (p.length !== 32) return false;
        // Prepend 0x02 to make a compressed SEC1 key, then validate
        const compressed = new Uint8Array(33);
        compressed[0] = 0x02;
        compressed.set(p, 1);
        return backend.isPoint(compressed);
    },
    xOnlyPointAddTweak: backend.xOnlyPointAddTweak.bind(backend),
    sign: backend.sign.bind(backend),
    signSchnorr: backend.signSchnorr?.bind(backend),
    verify: backend.verify.bind(backend),
    verifySchnorr: backend.verifySchnorr?.bind(backend),
    pointFromScalar: backend.pointFromScalar.bind(backend),
    privateAdd: backend.privateAdd.bind(backend),
    privateNegate: backend.privateNegate.bind(backend),
};

// Initialize the ECC library once at module load
initEccLib(eccLib);
