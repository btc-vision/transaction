import { IPreimage, RawPreimage } from '../interfaces/IPreimage.js';
import { Preimage } from '../IPreimage.js';

export class EpochValidator {
    private static readonly BLOCKS_PER_EPOCH: bigint = 5n;
    private static readonly GRAFFITI_LENGTH: number = 16;

    /**
     * Convert Buffer to Uint8Array
     */
    public static bufferToUint8Array(buffer: Buffer): Uint8Array {
        return new Uint8Array(buffer);
    }

    /**
     * Convert Uint8Array to Buffer
     */
    public static uint8ArrayToBuffer(array: Uint8Array): Buffer {
        return Buffer.from(array);
    }

    /**
     * Calculate SHA-1 hash
     */
    public static async sha1(data: Uint8Array): Promise<Uint8Array> {
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        return new Uint8Array(hashBuffer);
    }

    /**
     * Calculate mining preimage
     */
    public static calculatePreimage(checksumRoot: Buffer, publicKey: Buffer, salt: Buffer): Buffer {
        // Ensure all are 32 bytes
        if (checksumRoot.length !== 32 || publicKey.length !== 32 || salt.length !== 32) {
            throw new Error('All inputs must be 32 bytes');
        }

        const preimage = Buffer.alloc(32);
        for (let i = 0; i < 32; i++) {
            preimage[i] = checksumRoot[i] ^ publicKey[i] ^ salt[i];
        }

        return preimage;
    }

    /**
     * Count matching bits between two hashes
     */
    public static countMatchingBits(hash1: Buffer, hash2: Buffer): number {
        let matchingBits = 0;
        const minLength = Math.min(hash1.length, hash2.length);

        for (let i = 0; i < minLength; i++) {
            const byte1 = hash1[i];
            const byte2 = hash2[i];

            if (byte1 === byte2) {
                matchingBits += 8;
            } else {
                // Check individual bits
                for (let bit = 7; bit >= 0; bit--) {
                    if (((byte1 >> bit) & 1) === ((byte2 >> bit) & 1)) {
                        matchingBits++;
                    } else {
                        return matchingBits;
                    }
                }
            }
        }

        return matchingBits;
    }

    /**
     * Verify an epoch solution using IPreimage
     */
    public static async verifySolution(preimage: IPreimage): Promise<boolean> {
        try {
            const verification = preimage.verification;
            const calculatedPreimage = this.calculatePreimage(
                verification.targetChecksum,
                preimage.publicKey.toBuffer(),
                preimage.salt,
            );

            const computedSolution = await this.sha1(this.bufferToUint8Array(calculatedPreimage));
            const computedSolutionBuffer = this.uint8ArrayToBuffer(computedSolution);

            if (!computedSolutionBuffer.equals(preimage.solution)) {
                console.error('Solution mismatch');
                return false;
            }

            const matchingBits = this.countMatchingBits(
                computedSolutionBuffer,
                verification.targetHash,
            );

            if (matchingBits !== preimage.difficulty) {
                console.error(
                    `Difficulty mismatch: expected ${preimage.difficulty}, got ${matchingBits}`,
                );
                return false;
            }

            const expectedStartBlock = preimage.epochNumber * this.BLOCKS_PER_EPOCH;
            const expectedEndBlock = expectedStartBlock + this.BLOCKS_PER_EPOCH - 1n;

            if (
                verification.startBlock !== expectedStartBlock ||
                verification.endBlock !== expectedEndBlock
            ) {
                console.error('Epoch bounds mismatch');
                return false;
            }

            return true;
        } catch (error) {
            console.error('Verification error:', error);
            return false;
        }
    }

    /**
     * Get the mining target block for an epoch
     */
    public static getMiningTargetBlock(epochNumber: bigint): bigint | null {
        if (epochNumber === 0n) {
            return null; // Epoch 0 cannot be mined
        }

        // Last block of previous epoch
        return epochNumber * this.BLOCKS_PER_EPOCH - 1n;
    }

    /**
     * Validate epoch winner from raw data
     */
    public static async validateEpochWinner(epochData: RawPreimage): Promise<boolean> {
        const preimage = new Preimage(epochData);
        return await this.verifySolution(preimage);
    }

    /**
     * Validate epoch winner from Preimage instance
     */
    public static async validatePreimage(preimage: IPreimage): Promise<boolean> {
        return await this.verifySolution(preimage);
    }

    /**
     * Calculate solution hash from preimage components
     * @param targetChecksum The target checksum (32 bytes)
     * @param publicKey The public key buffer (32 bytes)
     * @param salt The salt buffer (32 bytes)
     * @returns The SHA-1 hash of the preimage
     */
    public static async calculateSolution(
        targetChecksum: Buffer,
        publicKey: Buffer,
        salt: Buffer,
    ): Promise<Buffer> {
        const preimage = this.calculatePreimage(targetChecksum, publicKey, salt);
        const hash = await this.sha1(this.bufferToUint8Array(preimage));
        return this.uint8ArrayToBuffer(hash);
    }

    /**
     * Check if a solution meets the minimum difficulty requirement
     */
    public static checkDifficulty(
        solution: Buffer,
        targetHash: Buffer,
        minDifficulty: number,
    ): { valid: boolean; difficulty: number } {
        const difficulty = this.countMatchingBits(solution, targetHash);
        return {
            valid: difficulty >= minDifficulty,
            difficulty,
        };
    }
}
