import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { SharedInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { Address } from '@btc-vision/bsi-binary';
import { crypto as bitCrypto, Payment, Psbt, Signer, Stack } from 'bitcoinjs-lib';
import { TransactionBuilder } from './TransactionBuilder';
import { CustomGenerator } from '../../generators/builders/CustomGenerator';
import { BitcoinUtils } from '../../utils/BitcoinUtils';
import { EcKeyPair } from '../../keypair/EcKeyPair';
import { AddressGenerator } from '../../generators/AddressGenerator';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';

export interface ICustomTransactionParameters extends SharedInteractionParameters {
    readonly script: (Buffer | Stack)[];
    readonly witnesses: Buffer[];

    readonly to: Address;
}

/**
 * Class for interaction transactions
 * @class CustomScriptTransaction
 */
export class CustomScriptTransaction extends TransactionBuilder<TransactionType.CUSTOM_CODE> {
    public type: TransactionType.CUSTOM_CODE = TransactionType.CUSTOM_CODE;

    /**
     * The contract address
     * @protected
     */
    protected readonly _scriptAddress: Address;
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
    private generator: CustomGenerator;

    /**
     * The contract seed
     * @private
     */
    private readonly scriptSeed: Buffer;

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

    /**
     * The witnesses
     * @private
     */
    private readonly witnesses: Buffer[];

    public constructor(parameters: ICustomTransactionParameters) {
        super(parameters);

        if (!parameters.script) throw new Error('Bitcoin script is required');
        if (!parameters.witnesses) throw new Error('Witness(es) are required');

        this.witnesses = parameters.witnesses;
        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();

        this.scriptSeed = this.getContractSeed();
        this.contractSigner = EcKeyPair.fromSeedKeyPair(this.scriptSeed, this.network);

        this.generator = new CustomGenerator(this.internalPubKeyToXOnly(), this.network);

        this.compiledTargetScript = this.generator.compile(parameters.script);

        this.scriptTree = this.getScriptTree();

        this.internalInit();

        this._scriptAddress = AddressGenerator.generatePKSH(this.scriptSeed, this.network);
    }

    /**
     * @description Get the contract address (PKSH)
     */
    public get scriptAddress(): Address {
        return this._scriptAddress;
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
        return bitCrypto.hash256(this.randomBytes);
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

        const scriptSolution = this.witnesses;
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
