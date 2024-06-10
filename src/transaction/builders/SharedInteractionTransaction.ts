import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { address, Payment, Psbt, Signer } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { ECPairInterface } from 'ecpair';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TransactionType } from '../enums/TransactionType.js';
import { PsbtInputExtended, TapLeafScript } from '../interfaces/Tap.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import { SharedInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { TweakedSigner, TweakSettings } from '../../signer/TweakedSigner.js';

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

    protected tapLeafScript: TapLeafScript | null = null;
    protected readonly calldataGenerator: CalldataGenerator;

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
     * The tweaked signer for the interaction (if any)
     * @protected
     */
    protected tweakedSigner?: Signer;

    /**
     * Script signer for the interaction
     * @protected
     */
    protected readonly scriptSigner: Signer;

    protected constructor(parameters: SharedInteractionParameters) {
        super(parameters);

        if (!parameters.calldata) {
            throw new Error('Calldata is required');
        }

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
     * Tweak the signer for the interaction
     * @protected
     */
    protected tweakSigner(): void {
        this.tweakedSigner = this.getTweakedSigner();
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
     * Add inputs from the UTXO
     * @protected
     *
     * @throws {Error} If the tap leaf script is required
     */
    protected override addInputsFromUTXO(): void {
        if (!this.tapLeafScript) throw new Error('Tap leaf script is required');

        for (let utxo of this.utxos) {
            const input: PsbtInputExtended = {
                hash: utxo.transactionId,
                index: utxo.outputIndex,
                witnessUtxo: {
                    value: Number(utxo.value),
                    script: this.getTapOutput(),
                },
                tapLeafScript: [this.tapLeafScript],
                sequence: this.sequence,
            };

            this.addInput(input);
        }
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
    protected override buildTransaction(): void {
        if (!this.to) throw new Error('To address is required');

        const selectedRedeem = !!this.scriptSigner
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

        this.addInputsFromUTXO();

        const amountSpent: bigint = this.getTransactionOPNetFee();
        this.addOutput({
            value: Number(amountSpent),
            address: this.to,
        });

        this.addRefundOutput(amountSpent);
    }

    /**
     * Sign the inputs
     * @param {Psbt} transaction The transaction to sign
     * @protected
     */
    protected signInputs(transaction: Psbt): void {
        if (!this.scriptSigner) {
            super.signInputs(transaction);

            return;
        }

        transaction.signInput(0, this.scriptSigner);
        transaction.signInput(0, this.getSignerKey());

        transaction.finalizeInput(0, this.customFinalizer);
    }

    /**
     * Get the signer
     * @protected
     *
     * @returns {Signer} The signer
     */
    protected getSignerKey(): Signer {
        if (this.tweakedSigner) {
            return this.tweakedSigner;
        }

        return this.signer;
    }

    protected override generateScriptAddress(): Payment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
        };
    }

    protected override generateTapData(): Payment {
        const selectedRedeem = !!this.scriptSigner
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
                output: this.getLeafScript(),
                version: 192,
            },
        ];
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
     * Transaction finalizer
     * @param {number} _inputIndex The input index
     * @param {PsbtInput} input The input
     */
    private customFinalizer = (_inputIndex: number, input: PsbtInput) => {
        if (!this.tapLeafScript) {
            throw new Error('Tap leaf script is required');
        }

        if (!input.tapScriptSig) {
            throw new Error('Tap script signature is required');
        }

        if (!this.contractSecret) {
            throw new Error('Contract secret is required');
        }

        const scriptSolution = this.getScriptSolution(input);

        const witness = scriptSolution
            .concat(this.tapLeafScript.script)
            .concat(this.tapLeafScript.controlBlock);

        return {
            finalScriptWitness: this.witnessStackToScriptWitness(witness),
        };
    };

    /**
     * Get the tweaked hash
     * @private
     *
     * @returns {Buffer | undefined} The tweaked hash
     */
    private getTweakerHash(): Buffer | undefined {
        return this.tapData?.hash;
    }

    /**
     * Get the tweaked signer
     * @param {boolean} useTweakedHash Whether to use the tweaked hash
     * @private
     *
     * @returns {Signer} The tweaked signer
     */
    private getTweakedSigner(useTweakedHash: boolean = false): Signer {
        const settings: TweakSettings = {
            network: this.network,
        };

        if (useTweakedHash) {
            settings.tweakHash = this.getTweakerHash();
        }

        return TweakedSigner.tweakSigner(this.signer, settings);
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
            pubkeys: this.getPubKeys(),
            output: this.compiledTargetScript,
            redeemVersion: 192,
        };

        this.leftOverFundsScriptRedeem = {
            pubkeys: this.getPubKeys(),
            output: this.getLeafScript(),
            redeemVersion: 192,
        };
    }

    /**
     * Get the second leaf script
     * @private
     *
     * @returns {Buffer} The leaf script
     */
    private getLeafScript(): Buffer {
        // For now, we disable this.
        return SharedInteractionTransaction.LOCK_LEAF_SCRIPT;
    }
}
