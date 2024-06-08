import crypto, { createHash } from 'crypto';

/**
 * Utility class for Bitcoin related functions
 */
export class BitcoinUtils {
    /**
     * Converts satoshi to BTC
     * @param {number} btc - The amount in BTC
     * @returns {BigInt} The amount in satoshi
     */
    public static btcToSatoshi(btc: number): BigInt {
        return BigInt(btc * 100000000);
    }

    /**
     * Generates random bytes.
     * @public
     * @returns {Buffer} The random bytes
     */
    public static rndBytes(): Buffer {
        const buf = BitcoinUtils.getRandomValues(64);

        return Buffer.from(buf);
    }

    public static getRandomValues(length: number): Buffer {
        if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
            const array = new Uint8Array(length);
            window.crypto.getRandomValues(array);

            return Buffer.from(array);
        } else if (crypto && typeof crypto.getRandomValues === 'function') {
            const array = new Uint8Array(length);
            crypto.getRandomValues(array);

            return Buffer.from(array);
        } else {
            // Fallback to Math.random() if window.crypto is not available
            const randomValues = [];
            for (let i = 0; i < length; i++) {
                randomValues.push(Math.floor(Math.random() * 256));
            }

            return Buffer.from(randomValues);
        }
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

        return `0x${hash.toString('hex')}`;
    }
}
