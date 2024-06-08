import { TransactionType } from '../enums/TransactionType.js';
import { IDeploymentParameters } from '../interfaces/ITransactionParameters.js';
import bitcoin, { Payment, Psbt, Signer } from 'bitcoinjs-lib';
import { TransactionBuilder } from './TransactionBuilder.js';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { PsbtInputExtended, TapLeafScript } from '../interfaces/Tap.js';
import { DeploymentGenerator } from '../../generators/builders/DeploymentGenerator.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { TweakedSigner, TweakSettings } from '../../signer/TweakedSigner.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { AddressGenerator } from '../../generators/AddressGenerator.js';
import { Address } from '@btc-vision/bsi-binary';

export class DeploymentTransaction extends TransactionBuilder<TransactionType.DEPLOYMENT> {
    public type: TransactionType.DEPLOYMENT = TransactionType.DEPLOYMENT;

    /**
     * The contract address
     * @protected
     */
    protected readonly _contractAddress: Address;

    /**
     * The target script redeem
     * @private
     */
    private targetScriptRedeem: Payment | null = null;

    /**
     * The left over funds script redeem
     * @private
     */
    private leftOverFundsScriptRedeem: Payment | null = null;

    /**
     * The compiled target script
     * @private
     */
    private readonly compiledTargetScript: Buffer;

    /**
     * The script tree
     * @private
     */
    private readonly scriptTree: Taptree;

    /**
     * The tweaked signer
     * @private
     */
    private readonly tweakedSigner: Signer | undefined;

    /**
     * The tap leaf script
     * @private
     */
    private tapLeafScript: TapLeafScript | null = null;

    /**
     * The deployment bitcoin generator
     * @private
     */
    private deploymentGenerator: DeploymentGenerator;

    /**
     * The contract seed
     * @private
     */
    private readonly contractSeed: Buffer;

    /**
     * The contract bytecode
     * @private
     */
    private readonly bytecode: Buffer;

    /**
     * The contract signer
     * @private
     */
    private readonly contractSigner: Signer;

    /**
     * The contract salt random bytes
     * @private
     */
    private readonly randomBytes: Buffer;

    public constructor(parameters: IDeploymentParameters) {
        super(parameters);

        this.bytecode = Compressor.compress(parameters.bytecode);
        if (!this.bytecode) throw new Error('Bytecode is required');

        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();

        this.contractSeed = this.getContractSeed();
        this.contractSigner = EcKeyPair.fromSeedKeyPair(this.contractSeed, this.network);

        this.deploymentGenerator = new DeploymentGenerator(
            this.internalPubKeyToXOnly(),
            this.contractSignerXOnlyPubKey(),
            this.network,
        );

        this.compiledTargetScript = this.deploymentGenerator.compile(
            this.bytecode,
            this.randomBytes,
        );

        this.scriptTree = this.getScriptTree();

        this.internalInit();

        this._contractAddress = AddressGenerator.generatePKSH(this.contractSeed, this.network);
    }

    /**
     * @description Get the contract address (PKSH)
     */
    public get contractAddress(): Address {
        return this._contractAddress;
    }

    /**
     * @description Get the P2TR address
     */
    public get p2trAddress(): Address {
        return this.to || this.getScriptAddress();
    }

    /**
     * Get the random bytes used for the interaction
     * @returns {Buffer} The random bytes
     */
    public getRndBytes(): Buffer {
        return this.randomBytes;
    }

    /**
     * Get the contract signer public key
     * @protected
     */
    protected contractSignerXOnlyPubKey(): Buffer {
        return toXOnly(this.contractSigner.publicKey);
    }

    /**
     * Add the required inputs from the UTXOs
     * @protected
     */
    protected override addInputsFromUTXO(): void {
        if (!this.tapLeafScript) throw new Error('Tap leaf script is required');

        for (let utxo of this.utxos) {
            const input: PsbtInputExtended = {
                hash: utxo.transactionId,
                index: utxo.outputIndex,
                witnessUtxo: {
                    value: Number(utxo.value),
                    script: this.getTapOutput() || utxo.scriptPubKey.hex,
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
     */
    protected override buildTransaction(): void {
        if (!this.to) {
            this.to = this.getScriptAddress();
        }

        const selectedRedeem = !!this.contractSigner
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
        if (!this.contractSigner) {
            super.signInputs(transaction);

            return;
        }

        transaction.signInput(0, this.contractSigner);
        transaction.signInput(0, this.getSignerKey());

        transaction.finalizeInput(0, this.customFinalizer);
    }

    /**
     * Get the signer key
     * @protected
     */
    protected getSignerKey(): Signer {
        if (this.tweakedSigner) {
            return this.tweakedSigner;
        }

        return this.signer;
    }

    /**
     * Get the tap output
     * @protected
     */
    protected override generateScriptAddress(): Payment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
        };
    }

    /**
     * Generate the tap data
     * @protected
     */
    protected override generateTapData(): Payment {
        const selectedRedeem = !!this.contractSigner
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
     * Generate the contract seed for the deployment
     * @private
     */
    private getContractSeed(): Buffer {
        if (!this.bytecode) {
            throw new Error('Bytecode is required');
        }

        const deployerPubKey: Buffer = this.internalPubKeyToXOnly();
        const salt: Buffer = bitcoin.crypto.hash256(this.randomBytes);
        const sha256OfBytecode: Buffer = bitcoin.crypto.hash256(this.bytecode);

        const buf: Buffer = Buffer.concat([deployerPubKey, salt, sha256OfBytecode]);

        return bitcoin.crypto.hash256(buf);
    }

    /**
     * Finalize the transaction
     * @param _inputIndex
     * @param input
     */
    private customFinalizer = (_inputIndex: number, input: PsbtInput) => {
        if (!this.tapLeafScript) {
            throw new Error('Tap leaf script is required');
        }

        if (!input.tapScriptSig) {
            throw new Error('Tap script signature is required');
        }

        const scriptSolution = [
            this.randomBytes,
            this.internalPubKeyToXOnly(),
            input.tapScriptSig[0].signature,
            input.tapScriptSig[1].signature,
        ];

        const witness = scriptSolution
            .concat(this.tapLeafScript.script)
            .concat(this.tapLeafScript.controlBlock);

        return {
            finalScriptWitness: this.witnessStackToScriptWitness(witness),
        };
    };

    /**
     * Tweaked hash
     * @private
     */
    private getTweakerHash(): Buffer | undefined {
        return this.tapData?.hash;
    }

    /**
     * Get the tweaked signer
     * @param {boolean} useTweakedHash
     * @private
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
     * Get the public keys for the redeem scripts
     * @private
     */
    private getPubKeys(): Buffer[] {
        const pubkeys = [this.signer.publicKey];

        if (this.contractSigner) {
            pubkeys.push(this.contractSigner.publicKey);
        }

        return pubkeys;
    }

    /**
     * Generate the redeem scripts
     * @private
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
     */
    private getLeafScript(): Buffer {
        return TransactionBuilder.LOCK_LEAF_SCRIPT;
    }

    /**
     * Get the script tree
     * @private
     */
    private getScriptTree(): Taptree {
        if (!this.bytecode) {
            throw new Error('Contract bytecode is required');
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
