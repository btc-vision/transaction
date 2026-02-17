import {
    type FinalScriptsFunc,
    type P2MRPayment,
    type P2TRPayment,
    PaymentType,
    Psbt,
    type PsbtInput,
    type Script,
    type Signer,
    type TapScriptSig,
    type Taptree,
    toXOnly,
} from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import { isUniversalSigner } from '../../signer/TweakedSigner.js';
import { MINIMUM_AMOUNT_REWARD, TransactionBuilder } from './TransactionBuilder.js';
import type { TapPayment } from '../shared/TweakedTransaction.js';
import { TransactionType } from '../enums/TransactionType.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import type { SharedInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';
import { TimeLockGenerator } from '../mineable/TimelockGenerator.js';
import type { IChallengeSolution } from '../../epoch/interfaces/IChallengeSolution.js';
import type { IP2WSHAddress } from '../mineable/IP2WSHAddress.js';

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
     * @type {Uint8Array}
     */
    public readonly randomBytes: Uint8Array;

    protected targetScriptRedeem: P2TRPayment | null = null;
    protected leftOverFundsScriptRedeem: P2TRPayment | null = null;

    protected abstract readonly compiledTargetScript: Uint8Array;
    protected abstract readonly scriptTree: Taptree;

    protected readonly challenge: IChallengeSolution;
    protected readonly epochChallenge: IP2WSHAddress;

    protected calldataGenerator: CalldataGenerator;

    /**
     * Calldata for the interaction
     * @protected
     */
    protected readonly calldata: Uint8Array;

    /**
     * Contract secret for the interaction
     * @protected
     */
    protected abstract readonly contractSecret: Uint8Array;

    /**
     * Script signer for the interaction
     * @protected
     */
    protected readonly scriptSigner: Signer | UniversalSigner;

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

        this.LOCK_LEAF_SCRIPT = this.defineLockScript();

        this.disableAutoRefund = parameters.disableAutoRefund || false;
        this.epochChallenge = TimeLockGenerator.generateTimeLockAddress(
            this.challenge.publicKey.originalPublicKeyBuffer(),
            this.network,
        );

        this.calldata = Compressor.compress(parameters.calldata);

        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();
        this.scriptSigner = this.generateKeyPairFromSeed();

        this.calldataGenerator = new CalldataGenerator(
            this.signer.publicKey,
            this.scriptSignerXOnlyPubKey(),
            this.network,
        );
    }

    public exportCompiledTargetScript(): Uint8Array {
        return this.compiledTargetScript;
    }

    /**
     * Get the contract secret
     * @returns {Uint8Array} The contract secret
     */
    public getContractSecret(): Uint8Array {
        return this.contractSecret;
    }

    /**
     * Get the random bytes used for the interaction
     * @returns {Uint8Array} The random bytes
     */
    public getRndBytes(): Uint8Array {
        return this.randomBytes;
    }

    /**
     * Get the preimage
     */
    public getChallenge(): IChallengeSolution {
        return this.challenge;
    }

    /**
     * Get the internal pubkey as an x-only key
     * @protected
     * @returns {Uint8Array} The internal pubkey as an x-only key
     */
    protected scriptSignerXOnlyPubKey(): Uint8Array {
        return toXOnly(this.scriptSigner.publicKey);
    }

    /**
     * Generate a key pair from the seed
     * @protected
     *
     * @returns {UniversalSigner} The key pair
     */
    protected generateKeyPairFromSeed(): UniversalSigner {
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

    protected override generateScriptAddress(): TapPayment {
        if (this.useP2MR) {
            return {
                network: this.network,
                scriptTree: this.scriptTree,
                name: PaymentType.P2MR,
            } as P2MRPayment;
        }

        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
            name: PaymentType.P2TR,
        };
    }

    protected override generateTapData(): TapPayment {
        const selectedRedeem = this.scriptSigner
            ? this.targetScriptRedeem
            : this.leftOverFundsScriptRedeem;

        if (!selectedRedeem) {
            throw new Error('Left over funds script redeem is required');
        }

        if (!this.scriptTree) {
            throw new Error('Script tree is required');
        }

        if (this.useP2MR) {
            return {
                network: this.network,
                scriptTree: this.scriptTree,
                redeem: selectedRedeem,
                name: PaymentType.P2MR,
            } as P2MRPayment;
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
     * @returns {Uint8Array[]} The script solution
     */
    protected getScriptSolution(input: PsbtInput): Uint8Array[] {
        if (!input.tapScriptSig) {
            throw new Error('Tap script signature is required');
        }

        return [
            this.contractSecret,
            (input.tapScriptSig[0] as TapScriptSig).signature,
            (input.tapScriptSig[1] as TapScriptSig).signature,
        ] as Uint8Array[];
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
                output: this.LOCK_LEAF_SCRIPT,
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
        await this.signInput(
            transaction,
            transaction.data.inputs[0] as PsbtInput,
            0,
            this.scriptSigner,
        );

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
        // Input 0: always sequential (needs scriptSigner + main signer, custom finalizer)
        await this.signInput(
            transaction,
            transaction.data.inputs[0] as PsbtInput,
            0,
            this.scriptSigner,
        );
        await this.signInput(
            transaction,
            transaction.data.inputs[0] as PsbtInput,
            0,
            this.getSignerKey(),
        );
        transaction.finalizeInput(0, this.customFinalizer.bind(this));

        // Inputs 1+: parallel key-path if available, then sequential for remaining
        if (this.canUseParallelSigning && isUniversalSigner(this.signer)) {
            let parallelSignedIndices = new Set<number>();

            try {
                const result = await this.signKeyPathInputsParallel(transaction, new Set([0]));
                if (result.success) {
                    parallelSignedIndices = new Set(result.signatures.keys());
                }
            } catch (e) {
                this.error(
                    `Parallel signing failed, falling back to sequential: ${(e as Error).message}`,
                );
            }

            // Sign remaining inputs 1+ that weren't handled by parallel signing
            for (let i = 1; i < transaction.data.inputs.length; i++) {
                if (!parallelSignedIndices.has(i)) {
                    await this.signInput(
                        transaction,
                        transaction.data.inputs[i] as PsbtInput,
                        i,
                        this.signer,
                    );
                }
            }
        } else {
            for (let i = 1; i < transaction.data.inputs.length; i++) {
                await this.signInput(
                    transaction,
                    transaction.data.inputs[i] as PsbtInput,
                    i,
                    this.signer,
                );
            }
        }

        // Finalize inputs 1+
        for (let i = 1; i < transaction.data.inputs.length; i++) {
            try {
                transaction.finalizeInput(
                    i,
                    this.customFinalizerP2SH.bind(this) as FinalScriptsFunc,
                );
            } catch {
                transaction.finalizeInput(i);
            }
        }

        this.finalized = true;
    }

    protected async createMineableRewardOutputs(): Promise<void> {
        if (!this.to) throw new Error('To address is required');

        const opnetFee = this.getTransactionOPNetFee();

        // Add the output to challenge address
        this.addFeeToOutput(opnetFee, this.to, this.epochChallenge, false);

        // Get the actual amount added to outputs (might be MINIMUM_AMOUNT_REWARD if opnetFee is too small)
        const actualOutputAmount =
            opnetFee < MINIMUM_AMOUNT_REWARD ? MINIMUM_AMOUNT_REWARD : opnetFee;

        const optionalAmount = this.addOptionalOutputsAndGetAmount();

        if (!this.disableAutoRefund) {
            // Pass the TOTAL amount spent: actual output amount + optional outputs
            await this.addRefundOutput(actualOutputAmount + optionalAmount);
        }
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
            output: this.compiledTargetScript as Script,
            redeemVersion: 192,
        };

        this.leftOverFundsScriptRedeem = {
            name: PaymentType.P2TR,
            output: this.LOCK_LEAF_SCRIPT,
            redeemVersion: 192,
        };
    }
}
