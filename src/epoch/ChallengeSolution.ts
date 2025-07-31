import { stringToBuffer } from '../utils/StringToBuffer.js';
import {
    IChallengeSolution,
    IChallengeSubmission,
    IChallengeVerification,
    RawChallenge,
    RawChallengeSubmission,
    RawChallengeVerification,
} from './interfaces/IChallengeSolution.js';
import { Address } from '../keypair/Address.js';
import { EpochValidator } from './validator/EpochValidator.js';
import { BinaryWriter } from '../buffer/BinaryWriter.js';
import { MessageSigner } from '../keypair/MessageSigner.js';

export class ChallengeVerification implements IChallengeVerification {
    public readonly epochHash: Buffer;
    public readonly epochRoot: Buffer;
    public readonly targetHash: Buffer;
    public readonly targetChecksum: Buffer;
    public readonly startBlock: bigint;
    public readonly endBlock: bigint;
    public readonly proofs: readonly Buffer[];

    constructor(data: RawChallengeVerification) {
        this.epochHash = stringToBuffer(data.epochHash);
        this.epochRoot = stringToBuffer(data.epochRoot);
        this.targetHash = stringToBuffer(data.targetHash);
        this.targetChecksum = stringToBuffer(data.targetChecksum);
        this.startBlock = BigInt(data.startBlock);
        this.endBlock = BigInt(data.endBlock);
        this.proofs = Object.freeze(data.proofs.map((proof) => stringToBuffer(proof)));
    }
}

export class ChallengeSubmission implements IChallengeSubmission {
    public readonly publicKey: Address;
    public readonly solution: Buffer;
    public readonly graffiti: Buffer | undefined;
    public readonly signature: Buffer;

    constructor(
        data: RawChallengeSubmission,
        public readonly epochNumber: bigint,
    ) {
        this.publicKey = Address.fromString(data.publicKey);
        this.solution = stringToBuffer(data.solution);
        this.graffiti = data.graffiti ? stringToBuffer(data.graffiti) : undefined;
        this.signature = stringToBuffer(data.signature);
    }

    public verifySignature(): boolean {
        const signatureDataWriter = new BinaryWriter();
        signatureDataWriter.writeAddress(this.publicKey);
        signatureDataWriter.writeU64(this.epochNumber);
        signatureDataWriter.writeBytes(this.solution);

        if (this.graffiti) {
            signatureDataWriter.writeBytes(this.graffiti);
        }

        const buffer = signatureDataWriter.getBuffer();
        return MessageSigner.verifySignature(this.publicKey, buffer, this.signature);
    }
}

export class ChallengeSolution implements IChallengeSolution {
    public readonly epochNumber: bigint;
    public readonly publicKey: Address;
    public readonly solution: Buffer;
    public readonly salt: Buffer;
    public readonly graffiti: Buffer;
    public readonly difficulty: number;
    public readonly verification: ChallengeVerification;

    private readonly submission?: ChallengeSubmission;

    constructor(data: RawChallenge) {
        this.epochNumber = BigInt(data.epochNumber);
        this.publicKey = Address.fromString(data.publicKey);
        this.solution = stringToBuffer(data.solution);
        this.salt = stringToBuffer(data.salt);
        this.graffiti = stringToBuffer(data.graffiti);
        this.difficulty = data.difficulty;
        this.verification = new ChallengeVerification(data.verification);
        this.submission = data.submission
            ? new ChallengeSubmission(data.submission, this.epochNumber + 2n)
            : data.submission;
    }

    /**
     * Static method to validate from raw data directly
     */
    public static async validateRaw(data: RawChallenge): Promise<boolean> {
        return EpochValidator.validateEpochWinner(data);
    }

    public verifySubmissionSignature(): boolean {
        if (!this.submission) {
            throw new Error('No submission provided in request.');
        }

        return this.submission.verifySignature();
    }

    public getSubmission(): ChallengeSubmission | undefined {
        if (!this.submission) {
            return;
        }

        if (!this.verifySubmissionSignature()) {
            throw new Error('Invalid submission signature.');
        }

        return this.submission;
    }

    /**
     * Verify this challenge
     * @returns {Promise<boolean>} True if the challenge is valid
     */
    public async verify(): Promise<boolean> {
        return EpochValidator.validateChallengeSolution(this);
    }

    /**
     * Get the preimage challenge
     * @returns {Buffer} The solution/challenge as a buffer
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
    public toRaw(): RawChallenge {
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
     * Calculate the expected solution hash for this challenge
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
     * Check if the challenge meets a specific difficulty requirement
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
