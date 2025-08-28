import { P2TRPayment, PaymentType, Psbt, PsbtInput, Signer, Taptree, toXOnly, } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TransactionType } from '../enums/TransactionType.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import { SharedInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';
import { TimeLockGenerator } from '../mineable/TimelockGenerator.js';
import { ChallengeSolution } from '../../epoch/ChallengeSolution.js';
import { IP2WSHAddress } from '../mineable/IP2WSHAddress.js';

/**
 * Shared interaction transaction
 * @class SharedInteractionTransaction
 */
export abstract class SharedInteractionTransaction<
    T extends TransactionType,
> extends TransactionBuilder<T> {
    public static readonly MAXIMUM_CALLDATA_SIZE = 1024 * 1024; // 1MB

    /**
     * Random salt for the interaction
     * @type {Buffer}
     */
    public readonly randomBytes: Buffer;

    protected targetScriptRedeem: P2TRPayment | null = null;
    protected leftOverFundsScriptRedeem: P2TRPayment | null = null;

    protected abstract readonly compiledTargetScript: Buffer;
    protected abstract readonly scriptTree: Taptree;

    protected readonly challenge: ChallengeSolution;
    protected readonly epochChallenge: IP2WSHAddress;

    protected calldataGenerator: CalldataGenerator;

    /**
     * Calldata for the interaction
     * @protected
     */
    protected readonly calldata: Buffer;

    /**
     * Contract secret for the interaction
     * @protected
     */
    protected abstract readonly contractSecret: Buffer;

    /**
     * Script signer for the interaction
     * @protected
     */
    protected readonly scriptSigner: Signer | ECPairInterface;

    /**
     * Disable auto refund
     * @protected
     */
    protected readonly disableAutoRefund: boolean;

    protected constructor(parameters: SharedInteractionParameters) {
        super(parameters);

        if (!parameters.calldata) {
            throw new Error('Calldata is required');
        }

        if (!parameters.challenge) {
            throw new Error('Challenge solution is required');
        }

        this.challenge = parameters.challenge;

        this.disableAutoRefund = parameters.disableAutoRefund || false;
        this.epochChallenge = TimeLockGenerator.generateTimeLockAddress(
            this.challenge.publicKey.originalPublicKeyBuffer(),
            this.network,
        );

        this.calldata = Compressor.compress(parameters.calldata);

        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();
        this.scriptSigner = this.generateKeyPairFromSeed();

        this.calldataGenerator = new CalldataGenerator(
            Buffer.from(this.signer.publicKey),
            this.scriptSignerXOnlyPubKey(),
            this.network,
        );
    }

    /**
     * Get the contract secret
     * @returns {Buffer} The contract secret
     */
    public getContractSecret(): Buffer {
        return this.contractSecret;
    }

    /**
     * Get the random bytes used for the interaction
     * @returns {Buffer} The random bytes
     */
    public getRndBytes(): Buffer {
        return this.randomBytes;
    }

    /**
     * Get the preimage
     */
    public getChallenge(): ChallengeSolution {
        return this.challenge;
    }

    /**
     * Get the internal pubkey as an x-only key
     * @protected
     * @returns {Buffer} The internal pubkey as an x-only key
     */
    protected scriptSignerXOnlyPubKey(): Buffer {
        return toXOnly(Buffer.from(this.scriptSigner.publicKey));
    }

    /**
     * Generate a key pair from the seed
     * @protected
     *
     * @returns {ECPairInterface} The key pair
     */
    protected generateKeyPairFromSeed(): ECPairInterface {
        return EcKeyPair.fromSeedKeyPair(this.randomBytes, this.network);
    }

    /**
     * Build the transaction
     * @protected
     *
     * @throws {Error} If the left over funds script redeem is required
     * @throws {Error} If the left over funds script redeem version is required
     * @throws {Error} If the left over funds script redeem output is required
     * @throws {Error} If the to address is required
     */
    protected override async buildTransaction(): Promise<void> {
        const selectedRedeem = this.scriptSigner
            ? this.targetScriptRedeem
            : this.leftOverFundsScriptRedeem;

        if (!selectedRedeem) {
            throw new Error('Left over funds script redeem is required');
        }

        if (!selectedRedeem.redeemVersion) {
            throw new Error('Left over funds script redeem version is required');
        }

        if (!selectedRedeem.output) {
            throw new Error('Left over funds script redeem output is required');
        }

        this.tapLeafScript = {
            leafVersion: selectedRedeem.redeemVersion,
            script: selectedRedeem.output,
            controlBlock: this.getWitness(),
        };

        if (!this.regenerated) {
            this.addInputsFromUTXO();
        }

        await this.createMineableRewardOutputs();
    }

    /**
     * Sign the inputs
     * @param {Psbt} transaction The transaction to sign
     * @protected
     */
    protected override async signInputs(transaction: Psbt): Promise<void> {
        if (!this.scriptSigner) {
            await super.signInputs(transaction);

            return;
        }

        if ('multiSignPsbt' in this.signer) {
            await this.signInputsWalletBased(transaction);
        } else {
            await this.signInputsNonWalletBased(transaction);
        }
    }

    protected override generateScriptAddress(): P2TRPayment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
            name: PaymentType.P2TR,
        };
    }

    protected override generateTapData(): P2TRPayment {
        const selectedRedeem = this.scriptSigner
            ? this.targetScriptRedeem
            : this.leftOverFundsScriptRedeem;

        if (!selectedRedeem) {
            throw new Error('Left over funds script redeem is required');
        }

        if (!this.scriptTree) {
            throw new Error('Script tree is required');
        }

        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
            redeem: selectedRedeem,
            name: PaymentType.P2TR,
        };
    }

    /**
     * Generate the script solution
     * @param {PsbtInput} input The input
     * @protected
     *
     * @returns {Buffer[]} The script solution
     */
    protected getScriptSolution(input: PsbtInput): Buffer[] {
        if (!input.tapScriptSig) {
            throw new Error('Tap script signature is required');
        }

        return [
            this.contractSecret,
            input.tapScriptSig[0].signature,
            input.tapScriptSig[1].signature,
        ] as Buffer[];
    }

    /**
     * Get the script tree
     * @private
     *
     * @returns {Taptree} The script tree
     */
    protected getScriptTree(): Taptree {
        if (!this.calldata) {
            throw new Error('Calldata is required');
        }

        this.generateRedeemScripts();

        return [
            {
                output: this.compiledTargetScript,
                version: 192,
            },
            {
                output: SharedInteractionTransaction.LOCK_LEAF_SCRIPT,
                version: 192,
            },
        ];
    }

    /**
     * Transaction finalizer
     * @param {number} _inputIndex The input index
     * @param {PsbtInput} input The input
     */
    protected customFinalizer = (_inputIndex: number, input: PsbtInput) => {
        if (!this.tapLeafScript) {
            throw new Error('Tap leaf script is required');
        }

        if (!this.contractSecret) {
            throw new Error('Contract secret is required');
        }

        const scriptSolution = this.getScriptSolution(input);
        const witness = scriptSolution
            .concat(this.tapLeafScript.script)
            .concat(this.tapLeafScript.controlBlock);

        return {
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witness),
        };
    };

    // custom for interactions
    protected override async signInputsWalletBased(transaction: Psbt): Promise<void> {
        const signer: UnisatSigner = this.signer as UnisatSigner;

        // first, we sign the first input with the script signer.
        await this.signInput(transaction, transaction.data.inputs[0], 0, this.scriptSigner);

        // then, we sign all the remaining inputs with the wallet signer.
        await signer.multiSignPsbt([transaction]);

        // Then, we finalize every input.
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            if (i === 0) {
                transaction.finalizeInput(i, this.customFinalizer.bind(this));
            } else {
                try {
                    transaction.finalizeInput(i, this.customFinalizerP2SH.bind(this));
                } catch (e) {
                    transaction.finalizeInput(i);
                }
            }
        }
    }

    protected override async signInputsNonWalletBased(transaction: Psbt): Promise<void> {
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            if (i === 0) {
                await this.signInput(transaction, transaction.data.inputs[i], i, this.scriptSigner);

                await this.signInput(
                    transaction,
                    transaction.data.inputs[i],
                    i,
                    this.getSignerKey(),
                );

                transaction.finalizeInput(0, this.customFinalizer.bind(this));
            } else {
                await this.signInput(transaction, transaction.data.inputs[i], i, this.signer);

                try {
                    transaction.finalizeInput(i, this.customFinalizerP2SH.bind(this));
                } catch (e) {
                    transaction.finalizeInput(i);
                }
            }
        }
    }

    protected async createMineableRewardOutputs(): Promise<void> {
        if (!this.to) throw new Error('To address is required');

        const amountSpent: bigint = this.getTransactionOPNetFee();

        this.addFeeToOutput(amountSpent, this.to, this.epochChallenge, false);

        const amount = this.addOptionalOutputsAndGetAmount();
        if (!this.disableAutoRefund) {
            await this.addRefundOutput(amountSpent + amount);
        }
    }

    /**
     * Get the public keys
     * @private
     *
     * @returns {Buffer[]} The public keys
     */
    private getPubKeys(): Buffer[] {
        const pubKeys = [Buffer.from(this.signer.publicKey)];

        if (this.scriptSigner) {
            pubKeys.push(Buffer.from(this.scriptSigner.publicKey));
        }

        return pubKeys;
    }

    /**
     * Generate the redeem scripts
     * @private
     *
     * @throws {Error} If the public keys are required
     * @throws {Error} If the leaf script is required
     * @throws {Error} If the leaf script version is required
     * @throws {Error} If the leaf script output is required
     * @throws {Error} If the target script redeem is required
     */
    private generateRedeemScripts(): void {
        this.targetScriptRedeem = {
            name: PaymentType.P2TR,
            output: this.compiledTargetScript,
            redeemVersion: 192,
        };

        this.leftOverFundsScriptRedeem = {
            name: PaymentType.P2TR,
            output: SharedInteractionTransaction.LOCK_LEAF_SCRIPT,
            redeemVersion: 192,
        };
    }
}
