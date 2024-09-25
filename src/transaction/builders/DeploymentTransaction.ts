import { TransactionType } from '../enums/TransactionType.js';
import { IDeploymentParameters } from '../interfaces/ITransactionParameters.js';
import { crypto as bitCrypto, Payment, Psbt, Signer } from 'bitcoinjs-lib';
import { TransactionBuilder } from './TransactionBuilder.js';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { DeploymentGenerator } from '../../generators/builders/DeploymentGenerator.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { AddressGenerator } from '../../generators/AddressGenerator.js';
import { Address } from '@btc-vision/bsi-binary';

export class DeploymentTransaction extends TransactionBuilder<TransactionType.DEPLOYMENT> {
    public static readonly MAXIMUM_CONTRACT_SIZE = 128 * 1024;
    public type: TransactionType.DEPLOYMENT = TransactionType.DEPLOYMENT;
    /**
     * The contract address
     * @protected
     */
    protected readonly _contractAddress: Address;
    /**
     * The tap leaf script
     * @private
     */
    protected tapLeafScript: TapLeafScript | null = null;
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

        if (this.bytecode.length > DeploymentTransaction.MAXIMUM_CONTRACT_SIZE)
            throw new Error('Contract size overflow.');

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
     * Build the transaction
     * @protected
     */
    protected override async buildTransaction(): Promise<void> {
        if (!this.to) {
            this.to = this.getScriptAddress();
        }

        const selectedRedeem = this.contractSigner
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

        await this.addRefundOutput(amountSpent);
    }

    /**
     * Sign the inputs
     * @param {Psbt} transaction The transaction to sign
     * @protected
     */
    protected async signInputs(transaction: Psbt): Promise<void> {
        if (!this.contractSigner) {
            await super.signInputs(transaction);

            return;
        }

        for (let i = 0; i < transaction.data.inputs.length; i++) {
            if (i === 0) {
                // multi sig input
                transaction.signInput(0, this.contractSigner);
                transaction.signInput(0, this.getSignerKey());

                transaction.finalizeInput(0, this.customFinalizer);
            } else {
                transaction.signInput(i, this.getSignerKey());
                transaction.finalizeInput(i);
            }
        }
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
        const selectedRedeem = this.contractSigner
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
        const salt: Buffer = bitCrypto.hash256(this.randomBytes);
        const sha256OfBytecode: Buffer = bitCrypto.hash256(this.bytecode);

        const buf: Buffer = Buffer.concat([deployerPubKey, salt, sha256OfBytecode]);

        return bitCrypto.hash256(buf);
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
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witness),
        };
    };

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
