import crypto, { createHash } from 'crypto';

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
        } else if (crypto && typeof crypto.getRandomValues === 'function') {
            const array = new Uint8Array(length);
            crypto.getRandomValues(array);

            return Buffer.from(array);
        } else {
            console.log(
                `No secure random number generator available. Please upgrade your environment.`,
                globalThis.window.crypto,
                crypto,
            );
            throw new Error(
                'No secure random number generator available. Please upgrade your environment.',
            );
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

        return `0x${Buffer.from(hash).toString('hex')}`;
    }

    /**
     * Deterministically order vaults by address
     * @param {VaultUTXOs[]} vaults - The vaults to order
     * @returns {VaultUTXOs[]} The ordered vaults
     */
    /*public static orderVaultsByAddress(vaults: VaultUTXOs[]): VaultUTXOs[] {
        return vaults.sort((a, b) => {
            return a.vault.localeCompare(b.vault);
        });
    }*/

    /**
     * Find the vault with the most public keys in a deterministic way.
     * @param {VaultUTXOs[]} vaults - The vaults to search
     * @returns {VaultUTXOs} The vault with the most public keys
     */
    /*public static findVaultWithMostPublicKeys(vaults: VaultUTXOs[]): VaultUTXOs {
        vaults = BitcoinUtils.orderVaultsByAddress(vaults);

        let mostPublicKeys: number = 0;
        let vault: VaultUTXOs | undefined;
        for (const v of vaults) {
            if (v.publicKeys.length > mostPublicKeys) {
                mostPublicKeys = v.publicKeys.length;
                vault = v;
            }
        }

        if (!vault) throw new Error('No vault with public keys found.');

        return vault;
    }*/
}
