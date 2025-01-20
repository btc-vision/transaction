import { createHash } from 'crypto';

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
     * @returns {Buffer} The random bytes
     */
    public static rndBytes(): Buffer {
        const buf = BitcoinUtils.getSafeRandomValues(64);

        return Buffer.from(buf);
    }

    public static getSafeRandomValues(length: number): Buffer {
        if (
            typeof globalThis.window !== 'undefined' &&
            globalThis.window.crypto &&
            typeof globalThis.window.crypto.getRandomValues === 'function'
        ) {
            const array = new Uint8Array(length);
            window.crypto.getRandomValues(array);

            return Buffer.from(array);
        } else if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
            const array = new Uint8Array(length);
            globalThis.crypto.getRandomValues(array);

            return Buffer.from(array);
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
     * @param {Buffer} data - The data to hash
     * @returns {string} The hashed data
     */
    public static opnetHash(data: Buffer): string {
        const hashed = createHash('sha512');
        hashed.update(data);

        const hash = hashed.digest();

        return `0x${Buffer.from(hash).toString('hex')}`;
    }
}
