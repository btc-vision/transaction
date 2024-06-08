import crypto from 'crypto';

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
        const buf = crypto.getRandomValues(new Uint8Array(64));

        return Buffer.from(buf);
    }

    /**
     * Hashes the given data
     * @param {Buffer} data - The data to hash
     * @returns {string} The hashed data
     */
    public static opnetHash(data: Buffer): string {
        const hashed = crypto.createHash('sha512');
        hashed.update(data);

        const hash = hashed.digest();

        return `0x${hash.toString('hex')}`;
    }
}
