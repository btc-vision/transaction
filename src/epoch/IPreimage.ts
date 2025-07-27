import { stringToBuffer } from '../utils/StringToBuffer.js';
import {
    IPreimage,
    IPreimageVerification,
    RawPreimage,
    RawPreimageVerification,
} from './interfaces/IPreimage.js';
import { Address } from '../keypair/Address.js';
import { EpochValidator } from './validator/EpochValidator.js';

export class PreimageVerification implements IPreimageVerification {
    public readonly epochHash: Buffer;
    public readonly epochRoot: Buffer;
    public readonly targetHash: Buffer;
    public readonly targetChecksum: Buffer;
    public readonly startBlock: bigint;
    public readonly endBlock: bigint;
    public readonly proofs: readonly Buffer[];

    constructor(data: RawPreimageVerification) {
        this.epochHash = stringToBuffer(data.epochHash);
        this.epochRoot = stringToBuffer(data.epochRoot);
        this.targetHash = stringToBuffer(data.targetHash);
        this.targetChecksum = stringToBuffer(data.targetChecksum);
        this.startBlock = BigInt(data.startBlock);
        this.endBlock = BigInt(data.endBlock);
        this.proofs = Object.freeze(data.proofs.map((proof) => stringToBuffer(proof)));
    }
}

export class Preimage implements IPreimage {
    public readonly epochNumber: bigint;
    public readonly publicKey: Address;
    public readonly solution: Buffer;
    public readonly salt: Buffer;
    public readonly graffiti: Buffer;
    public readonly difficulty: number;
    public readonly verification: PreimageVerification;

    constructor(data: RawPreimage) {
        this.epochNumber = BigInt(data.epochNumber);
        this.publicKey = Address.fromString(data.publicKey);
        this.solution = stringToBuffer(data.solution);
        this.salt = stringToBuffer(data.salt);
        this.graffiti = stringToBuffer(data.graffiti);
        this.difficulty = data.difficulty;
        this.verification = new PreimageVerification(data.verification);
    }
    
    /**
     * Static method to validate from raw data directly
     */
    public static async validateRaw(data: RawPreimage): Promise<boolean> {
        return EpochValidator.validateEpochWinner(data);
    }

    /**
     * Verify this preimage
     * @returns {Promise<boolean>} True if the preimage is valid
     */
    public async verify(): Promise<boolean> {
        return EpochValidator.validatePreimage(this);
    }

    /**
     * Get the preimage buffer (alias for solution)
     * @returns {Buffer} The solution/preimage as a buffer
     */
    public toBuffer(): Buffer {
        return this.solution;
    }

    /**
     * Get the solution as a hex string
     * @returns {string} The solution as a hex string with 0x prefix
     */
    public toHex(): string {
        return '0x' + this.solution.toString('hex');
    }

    /**
     * Convert to raw format for serialization
     */
    public toRaw(): RawPreimage {
        return {
            epochNumber: this.epochNumber.toString(),
            publicKey: this.publicKey.toHex(),
            solution: this.toHex(),
            salt: '0x' + this.salt.toString('hex'),
            graffiti: '0x' + this.graffiti.toString('hex'),
            difficulty: this.difficulty,
            verification: {
                epochHash: '0x' + this.verification.epochHash.toString('hex'),
                epochRoot: '0x' + this.verification.epochRoot.toString('hex'),
                targetHash: '0x' + this.verification.targetHash.toString('hex'),
                targetChecksum: '0x' + this.verification.targetChecksum.toString('hex'),
                startBlock: this.verification.startBlock.toString(),
                endBlock: this.verification.endBlock.toString(),
                proofs: this.verification.proofs.map((p) => '0x' + p.toString('hex')),
            },
        };
    }

    /**
     * Calculate the expected solution hash for this preimage
     * @returns {Promise<Buffer>} The calculated solution hash
     */
    public async calculateSolution(): Promise<Buffer> {
        return EpochValidator.calculateSolution(
            this.verification.targetChecksum,
            this.publicKey.toBuffer(),
            this.salt,
        );
    }

    /**
     * Check if the preimage meets a specific difficulty requirement
     * @param {number} minDifficulty The minimum difficulty required
     * @returns {Promise<{valid: boolean; difficulty: number}>} Validation result
     */
    public checkDifficulty(minDifficulty: number): { valid: boolean; difficulty: number } {
        return EpochValidator.checkDifficulty(
            this.solution,
            this.verification.targetHash,
            minDifficulty,
        );
    }

    /**
     * Get the mining target block for this epoch
     * @returns {bigint | null} The target block number or null if epoch 0
     */
    public getMiningTargetBlock(): bigint | null {
        return EpochValidator.getMiningTargetBlock(this.epochNumber);
    }
}
