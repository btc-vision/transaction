import { createHash } from 'crypto';

import { toHex } from '@btc-vision/bitcoin';

const hexPattern = /^[0-9a-fA-F]+$/;

/**
 * Utility class for Bitcoin related functions
 */
export class BitcoinUtils {
    /**
     * Converts satoshi to BTC
     * @param {number} btc - The amount in BTC
     * @returns {bigint} The amount in satoshi
     */
    public static btcToSatoshi(btc: number): bigint {
        return BigInt(btc * 100000000);
    }

    /**
     * Generates random bytes.
     * @public
     * @returns {Uint8Array} The random bytes
     */
    public static rndBytes(): Uint8Array {
        return BitcoinUtils.getSafeRandomValues(64);
    }

    public static getSafeRandomValues(length: number): Uint8Array {
        if (
            typeof globalThis.window !== 'undefined' &&
            globalThis.window.crypto &&
            typeof globalThis.window.crypto.getRandomValues === 'function'
        ) {
            const array = new Uint8Array(length);
            window.crypto.getRandomValues(array);

            return array;
        } else if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
            const array = new Uint8Array(length);
            globalThis.crypto.getRandomValues(array);

            return array;
        } else {
            console.log(
                `No secure random number generator available. Please upgrade your environment.`,
                globalThis.window.crypto,
                globalThis.crypto,
            );
            throw new Error(
                'No secure random number generator available. Please upgrade your environment.',
            );
        }
    }

    public static isValidHex(hex: string): boolean {
        return hexPattern.test(hex);
    }

    /**
     * Hashes the given data
     * @param {Uint8Array} data - The data to hash
     * @returns {string} The hashed data
     */
    public static opnetHash(data: Uint8Array): string {
        const hashed = createHash('sha512');
        hashed.update(data);

        const hash = hashed.digest();

        return `0x${toHex(new Uint8Array(hash))}`;
    }
}
