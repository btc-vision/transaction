const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

export class Secp256k1PointDeriver {
    /**
     * The maximum increments to try before giving up on deriving a valid x.
     */
    private maxTries: number;

    constructor(maxTries = 10000) {
        this.maxTries = maxTries;
    }

    /**
     * Main entry point.
     * Given a 32-byte input, ensures we obtain a "real" x on secp256k1.
     * - If the given x is valid, we use it.
     * - Otherwise, we increment x (mod p) until we find one whose (x^3 + 7) is a quadratic residue.
     * Then we return { x, y1, y2 } for that valid point.
     *
     * @param xBytes A 32-byte Uint8Array for the candidate x
     * @param failOnInvalidX (optional) whether to throw if the given x is not a valid curve point, defaults to true
     * @param maxTries (optional) number of increments to attempt, defaults to this.maxTries
     * @returns An object { x: bigint; y1: bigint; y2: bigint } describing a valid curve point
     * @throws If no valid x found within maxTries
     */
    public findOrDeriveValidPoint(
        xBytes: Uint8Array,
        failOnInvalidX: boolean = true,
        maxTries: number = this.maxTries,
    ): { x: bigint; y1: bigint; y2: bigint } {
        if (xBytes.length !== 32) {
            throw new Error('xBytes must be exactly 32 bytes.');
        }

        // Convert input to a BigInt in [0, p-1]
        let xCandidate = this.bytesToBigInt(xBytes) % P;

        // 2. Loop up to maxTries to find a valid x
        let sqrtVal = this.isValidX(xCandidate);
        if (failOnInvalidX && sqrtVal === null) {
            throw new Error(`The given x is not a valid curve point.`);
        }

        let tries = 0;
        while (sqrtVal === null) {
            xCandidate = (xCandidate + 1n) % P;
            sqrtVal = this.isValidX(xCandidate);

            tries++;
            if (tries > maxTries) {
                throw new Error(`Could not find a valid X point within ${maxTries} increments.`);
            }
        }

        // Now, sqrtVal is a valid 'r' for alpha = x^3 + 7
        // The two roots for y are: r and p-r
        const y1 = sqrtVal;
        const y2 = (P - y1) % P;

        return { x: xCandidate, y1, y2 };
    }

    /**
     * Given two candidate y values, returns the one with the smaller y-coordinate.
     * @param {bigint} y
     * @param {bigint} y2
     */
    public getCanonicalY(y: bigint, y2: bigint): bigint {
        return y < y2 ? y : y2;
    }

    /**
     * Creates a 65-byte "hybrid public key" from the specified x and y.
     * - First byte:
     *   - 0x06 if y is even
     *   - 0x07 if y is odd
     * - Next 32 bytes: x
     * - Last 32 bytes: y
     *
     * @param x X-coordinate as a bigint
     * @param y Y-coordinate as a bigint
     * @returns A Uint8Array of length 65
     */
    public getHybridPublicKey(x: bigint, y: bigint): Uint8Array {
        // Determine prefix based on parity of y
        const prefix = y % 2n === 0n ? 0x06 : 0x07;

        // Convert x and y to 32-byte big-endian arrays
        const xBytes = this.bigIntTo32Bytes(x);
        const yBytes = this.bigIntTo32Bytes(y);

        // Allocate 65 bytes: 1 for prefix + 32 for x + 32 for y
        const hybrid = new Uint8Array(65);
        hybrid[0] = prefix;
        hybrid.set(xBytes, 1);
        hybrid.set(yBytes, 33);

        return hybrid;
    }

    /**
     * Checks if (x^3 + 7) is a quadratic residue mod p.
     * Returns the square root if it is, or null if not.
     */
    private isValidX(x: bigint): bigint | null {
        // alpha = (x^3 + 7) mod p
        const alpha = (this.modPow(x, 3n, P) + 7n) % P;
        return this.sqrtModP(alpha, P);
    }

    /**
     * Computes base^exp (mod m) using exponentiation by squaring.
     */
    private modPow(base: bigint, exp: bigint, m: bigint): bigint {
        let result = 1n;
        let cur = base % m;
        let e = exp;

        while (e > 0) {
            if ((e & 1n) === 1n) {
                result = (result * cur) % m;
            }
            cur = (cur * cur) % m;
            e >>= 1n;
        }
        return result;
    }

    /**
     * sqrtModP(a, p):
     *   Attempts to compute the square root of `a` modulo prime `p`.
     *   Returns the root if it exists, or null if `a` is not a quadratic residue.
     *
     * Since p ≡ 3 (mod 4), we can do:
     *   sqrt(a) = a^((p+1)/4) mod p
     */
    private sqrtModP(a: bigint, prime: bigint): bigint | null {
        // Candidate root
        const root = this.modPow(a, (prime + 1n) >> 2n, prime);

        // Check if it's truly a root
        if ((root * root) % prime !== a % prime) {
            return null;
        }
        return root;
    }

    /**
     * Convert a 32-byte Uint8Array (big-endian) to a BigInt.
     */
    private bytesToBigInt(bytes: Uint8Array): bigint {
        let b = 0n;
        for (const byte of bytes) {
            b = (b << 8n) | BigInt(byte);
        }
        return b;
    }

    /**
     * Convert a BigInt to a 32-byte array (big-endian).
     */
    private bigIntTo32Bytes(value: bigint): Uint8Array {
        const bytes = new Uint8Array(32);
        for (let i = 31; i >= 0; i--) {
            bytes[i] = Number(value & 0xffn);
            value >>= 8n;
        }
        return bytes;
    }
}
