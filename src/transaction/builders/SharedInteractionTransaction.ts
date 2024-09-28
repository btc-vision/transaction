import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { address, Payment, Psbt, Signer } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { ECPairInterface } from 'ecpair';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TransactionType } from '../enums/TransactionType.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import { SharedInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';

/**
 * Shared interaction transaction
 * @class SharedInteractionTransaction
 */
export abstract class SharedInteractionTransaction<
    T extends TransactionType,
> extends TransactionBuilder<T> {
    /**
     * Random salt for the interaction
     * @type {Buffer}
     */
    public readonly randomBytes: Buffer;

    protected targetScriptRedeem: Payment | null = null;
    protected leftOverFundsScriptRedeem: Payment | null = null;

    protected abstract readonly compiledTargetScript: Buffer;
    protected abstract readonly scriptTree: Taptree;

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
    protected readonly scriptSigner: Signer;

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

        this.disableAutoRefund = parameters.disableAutoRefund || false;

        this.calldata = Compressor.compress(parameters.calldata);

        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();
        this.scriptSigner = this.generateKeyPairFromSeed();

        this.calldataGenerator = new CalldataGenerator(
            this.internalPubKeyToXOnly(),
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
     * Generate the secret for the interaction
     * @protected
     * @returns {Buffer} The secret
     * @throws {Error} If the to address is invalid
     */
    protected generateSecret(): Buffer {
        if (!this.to) throw new Error('To address is required');

        return address.fromBech32(this.to).data;
    }

    /**
     * Get the internal pubkey as an x-only key
     * @protected
     * @returns {Buffer} The internal pubkey as an x-only key
     */
    protected scriptSignerXOnlyPubKey(): Buffer {
        return toXOnly(this.scriptSigner.publicKey);
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
        if (!this.to) throw new Error('To address is required');

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

        const amountSpent: bigint = this.getTransactionOPNetFee();
        this.addOutput({
            value: Number(amountSpent),
            address: this.to,
        });

        if (!this.disableAutoRefund) {
            await this.addRefundOutput(amountSpent);
        }
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

        const txs: PsbtInput[] = transaction.data.inputs;
        for (let i = 0; i < txs.length; i += 20) {
            const batch = txs.slice(i, i + 20);

            const promises: Promise<void>[] = [];
            for (let y = 0; y < batch.length; y++) {
                const offset = i * 20 + y;
                const input = batch[y];

                //this.info(`Signing input #${offset} out of ${transaction.data.inputs.length}!`);

                promises.push(this.signIndividualInputs(transaction, input, offset));
            }

            await Promise.all(promises).catch((e: unknown) => {
                throw e;
            });
        }

        try {
            transaction.finalizeInput(0, this.customFinalizer);

            this.log(`Finalized input 0!`);
        } catch (e) {
            console.log(`Failed to finalize input 0: ${(e as Error).stack}`);
        }

        for (let i = 0; i < txs.length; i++) {
            try {
                transaction.finalizeInput(i);

                this.log(`Finalized input ${i}!`);
            } catch {}
        }
    }

    protected override generateScriptAddress(): Payment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
        };
    }

    protected override generateTapData(): Payment {
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
            this.internalPubKeyToXOnly(),
            input.tapScriptSig[0].signature,
            input.tapScriptSig[1].signature,
        ];
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

        //console.log('finalizing input', input);

        //if (!input.tapLeafScript) {
        //    throw new Error('Tap script signature is required');
        //}

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

    private async signIndividualInputs(
        transaction: Psbt,
        input: PsbtInput,
        i: number,
    ): Promise<void> {
        let signed: boolean = false;

        try {
            await this.signInput(transaction, input, i, this.scriptSigner);
            signed = true;
        } catch {}

        try {
            await this.signInput(transaction, input, i);
            signed = true;
        } catch {}

        if (signed) {
            this.log(
                `Signed input #${i} out of ${transaction.data.inputs.length}! {Signed: ${signed}}`,
            );

            return;
        }

        if (this.regenerated || this.ignoreSignatureErrors) {
            return;
        }

        throw new Error('Failed to sign input');
    }

    /**
     * Get the public keys
     * @private
     *
     * @returns {Buffer[]} The public keys
     */
    private getPubKeys(): Buffer[] {
        const pubkeys = [this.signer.publicKey];

        if (this.scriptSigner) {
            pubkeys.push(this.scriptSigner.publicKey);
        }

        return pubkeys;
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
            output: this.compiledTargetScript,
            redeemVersion: 192,
        };

        this.leftOverFundsScriptRedeem = {
            output: SharedInteractionTransaction.LOCK_LEAF_SCRIPT,
            redeemVersion: 192,
        };
    }
}
