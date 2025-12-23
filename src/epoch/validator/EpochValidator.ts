import { IChallengeSolution, RawChallenge } from '../interfaces/IChallengeSolution.js';
import { crypto } from '@btc-vision/bitcoin';
import { Address } from '../../keypair/Address.js';
import { stringToBuffer } from '../../utils/StringToBuffer.js';

export class EpochValidator {
    private static readonly BLOCKS_PER_EPOCH: bigint = 5n;

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
    public static sha1(data: Uint8Array | Buffer): Buffer {
        return crypto.sha1(Buffer.isBuffer(data) ? data : Buffer.from(data));
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
        if (hash1.length !== hash2.length) {
            throw new Error('Hashes must be of the same length');
        }

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
    public static verifySolution(challenge: IChallengeSolution, log: boolean = false): boolean {
        try {
            const verification = challenge.verification;
            const calculatedPreimage = this.calculatePreimage(
                verification.targetChecksum,
                challenge.publicKey.toBuffer(),
                challenge.salt,
            );

            const computedSolution = this.sha1(calculatedPreimage);
            const computedSolutionBuffer = this.uint8ArrayToBuffer(computedSolution);

            if (!computedSolutionBuffer.equals(challenge.solution)) {
                return false;
            }

            const matchingBits = this.countMatchingBits(
                computedSolutionBuffer,
                verification.targetHash,
            );

            if (matchingBits !== challenge.difficulty) {
                return false;
            }

            const expectedStartBlock = challenge.epochNumber * this.BLOCKS_PER_EPOCH;
            const expectedEndBlock = expectedStartBlock + this.BLOCKS_PER_EPOCH - 1n;

            return !(
                verification.startBlock !== expectedStartBlock ||
                verification.endBlock !== expectedEndBlock
            );
        } catch (error) {
            if (log) console.error('Verification error:', error);
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
    public static validateEpochWinner(epochData: RawChallenge): boolean {
        try {
            const epochNumber = BigInt(epochData.epochNumber);
            const publicKey = Address.fromString(
                epochData.mldsaPublicKey,
                epochData.legacyPublicKey,
            );
            const solution = stringToBuffer(epochData.solution);
            const salt = stringToBuffer(epochData.salt);
            const difficulty = epochData.difficulty;

            const verification = {
                epochHash: stringToBuffer(epochData.verification.epochHash),
                epochRoot: stringToBuffer(epochData.verification.epochRoot),
                targetHash: stringToBuffer(epochData.verification.targetHash),
                targetChecksum: stringToBuffer(epochData.verification.targetChecksum),
                startBlock: BigInt(epochData.verification.startBlock),
                endBlock: BigInt(epochData.verification.endBlock),
                proofs: Object.freeze(epochData.verification.proofs.map((p) => stringToBuffer(p))),
            };

            const calculatedPreimage = this.calculatePreimage(
                verification.targetChecksum,
                publicKey.toBuffer(),
                salt,
            );

            const computedSolution = this.sha1(calculatedPreimage);
            const computedSolutionBuffer = this.uint8ArrayToBuffer(computedSolution);

            if (!computedSolutionBuffer.equals(solution)) {
                return false;
            }

            const matchingBits = this.countMatchingBits(
                computedSolutionBuffer,
                verification.targetHash,
            );

            if (matchingBits !== difficulty) {
                return false;
            }

            const expectedStartBlock = epochNumber * this.BLOCKS_PER_EPOCH;
            const expectedEndBlock = expectedStartBlock + this.BLOCKS_PER_EPOCH - 1n;

            return !(
                verification.startBlock !== expectedStartBlock ||
                verification.endBlock !== expectedEndBlock
            );
        } catch {
            return false;
        }
    }

    /**
     * Validate epoch winner from Preimage instance
     */
    public static validateChallengeSolution(challenge: IChallengeSolution): boolean {
        return this.verifySolution(challenge);
    }

    /**
     * Calculate solution hash from preimage components
     * @param targetChecksum The target checksum (32 bytes)
     * @param publicKey The public key buffer (32 bytes)
     * @param salt The salt buffer (32 bytes)
     * @returns The SHA-1 hash of the preimage
     */
    public static calculateSolution(
        targetChecksum: Buffer,
        publicKey: Buffer,
        salt: Buffer,
    ): Buffer {
        const preimage = this.calculatePreimage(targetChecksum, publicKey, salt);
        const hash = this.sha1(this.bufferToUint8Array(preimage));
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
