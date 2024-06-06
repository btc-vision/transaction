import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { address, Payment, Psbt, Signer } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { ECPairInterface } from 'ecpair';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TransactionType } from '../enums/TransactionType.js';
import { PsbtInputExtended, TapLeafScript } from '../interfaces/Tap.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { TweakedSigner, TweakSettings } from '../../signer/TweakedSigner.js';

/**
 * Class for interaction transactions
 * @class InteractionTransaction
 */
export class InteractionTransaction extends TransactionBuilder<TransactionType.INTERACTION> {
    public type: TransactionType.INTERACTION = TransactionType.INTERACTION;

    /**
     * Random salt for the interaction
     * @type {Buffer}
     */
    public readonly randomBytes: Buffer = BitcoinUtils.rndBytes();

    protected targetScriptRedeem: Payment | null = null;
    protected leftOverFundsScriptRedeem: Payment | null = null;

    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;

    protected tapLeafScript: TapLeafScript | null = null;
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
    protected readonly contractSecret: Buffer = this.generateSecret();

    /**
     * The tweaked signer for the interaction (if any)
     * @protected
     */
    protected tweakedSigner?: Signer;

    /**
     * Script signer for the interaction
     * @protected
     */
    protected readonly scriptSigner: Signer = this.generateKeyPairFromSeed();

    /**
     * Public keys specified in the interaction
     * @protected
     */
    protected readonly interactionPubKeys: Buffer[];

    /**
     * Minimum signatures required for the interaction
     * @protected
     */
    protected readonly minimumSignatures: number;

    public constructor(parameters: IInteractionParameters) {
        super(parameters);

        if (!parameters.calldata) {
            throw new Error('Calldata is required');
        }

        this.calldata = Compressor.compress(parameters.calldata);
        this.interactionPubKeys = parameters.pubKeys || [];
        this.minimumSignatures = parameters.minimumSignatures || 0;

        this.calldataGenerator = new CalldataGenerator(
            this.internalPubKeyToXOnly(),
            this.scriptSignerXOnlyPubKey(),
            this.network,
        );

        this.compiledTargetScript = this.calldataGenerator.compile(
            this.calldata,
            this.contractSecret,
            this.interactionPubKeys,
            this.minimumSignatures,
        );

        this.scriptTree = this.getScriptTree();
        this.internalInit();
    }

    /**
     * Generate the secret for the interaction
     * @protected
     * @returns {Buffer} The secret
     * @throws {Error} If the to address is invalid
     */
    protected generateSecret(): Buffer {
        return address.fromBech32(this.to).data;
    }

    protected tweakSigner(): void {
        this.tweakedSigner = this.getTweakedSigner();
    }

    protected scriptSignerXOnlyPubKey(): Buffer {
        return toXOnly(this.scriptSigner.publicKey);
    }

    protected generateKeyPairFromSeed(): ECPairInterface {
        return EcKeyPair.fromSeedKeyPair(this.randomBytes, this.network);
    }

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
            };

            this.addInput(input);
        }
    }

    protected override buildTransaction(): void {
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

    protected signInputs(transaction: Psbt): void {
        if (!this.scriptSigner) {
            super.signInputs(transaction);

            return;
        }

        transaction.signInput(0, this.scriptSigner);
        transaction.signInput(0, this.getSignerKey());

        transaction.finalizeInput(0, this.customFinalizer);
    }

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

    private getPubKeys(): Buffer[] {
        const pubkeys = [this.signer.publicKey];

        if (this.scriptSigner) {
            pubkeys.push(this.scriptSigner.publicKey);
        }

        return pubkeys;
    }

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

    private getTweakerHash(): Buffer | undefined {
        return this.tapData?.hash;
    }

    private getTweakedSigner(useTweakedHash: boolean = false): Signer {
        const settings: TweakSettings = {
            network: this.network,
        };

        if (useTweakedHash) {
            settings.tweakHash = this.getTweakerHash();
        }

        return TweakedSigner.tweakSigner(this.signer, settings);
    }

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

    private getLeafScript(): Buffer {
        // For now, we disable this.
        return InteractionTransaction.LOCK_LEAF_SCRIPT;
    }

    private getScriptTree(): Taptree {
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
}
