import type { IChallengeSolution, RawChallenge } from '../interfaces/IChallengeSolution.js';
import { crypto, equals } from '@btc-vision/bitcoin';
import { Address } from '../../keypair/Address.js';
import { stringToBuffer } from '../../utils/StringToBuffer.js';

export class EpochValidator {
    private static readonly BLOCKS_PER_EPOCH: bigint = 5n;

    /**
     * Calculate SHA-1 hash
     */
    public static sha1(data: Uint8Array): Uint8Array {
        return crypto.sha1(data);
    }

    /**
     * Calculate mining preimage
     */
    public static calculatePreimage(
        checksumRoot: Uint8Array,
        publicKey: Uint8Array,
        salt: Uint8Array,
    ): Uint8Array {
        // Ensure all are 32 bytes
        if (checksumRoot.length !== 32 || publicKey.length !== 32 || salt.length !== 32) {
            throw new Error('All inputs must be 32 bytes');
        }

        const preimage = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            preimage[i] =
                (checksumRoot[i] as number) ^ (publicKey[i] as number) ^ (salt[i] as number);
        }

        return preimage;
    }

    /**
     * Count matching bits between two hashes
     */
    public static countMatchingBits(hash1: Uint8Array, hash2: Uint8Array): number {
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
                    if ((((byte1 as number) >> bit) & 1) === (((byte2 as number) >> bit) & 1)) {
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

            if (!equals(computedSolution, challenge.solution)) {
                return false;
            }

            const matchingBits = this.countMatchingBits(computedSolution, verification.targetHash);

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

            if (!equals(computedSolution, solution)) {
                return false;
            }

            const matchingBits = this.countMatchingBits(computedSolution, verification.targetHash);

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
        targetChecksum: Uint8Array,
        publicKey: Uint8Array,
        salt: Uint8Array,
    ): Uint8Array {
        const preimage = this.calculatePreimage(targetChecksum, publicKey, salt);
        return this.sha1(preimage);
    }

    /**
     * Check if a solution meets the minimum difficulty requirement
     */
    public static checkDifficulty(
        solution: Uint8Array,
        targetHash: Uint8Array,
        minDifficulty: number,
    ): { valid: boolean; difficulty: number } {
        const difficulty = this.countMatchingBits(solution, targetHash);
        return {
            valid: difficulty >= minDifficulty,
            difficulty,
        };
    }
}
