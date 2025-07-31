import {
    crypto as bitCrypto,
    P2TRPayment,
    Payment,
    PaymentType,
    Psbt,
    PsbtInput,
    Signer,
    Stack,
    Taptree,
    toXOnly,
} from '@btc-vision/bitcoin';
import { TransactionType } from '../enums/TransactionType.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { SharedInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { CustomGenerator } from '../../generators/builders/CustomGenerator.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { AddressGenerator } from '../../generators/AddressGenerator.js';
import { ECPairInterface } from 'ecpair';

export interface ICustomTransactionParameters
    extends Omit<SharedInteractionParameters, 'challenge'> {
    script: (Buffer | Stack)[];
    witnesses: Buffer[];

    /** optional Taproot annex payload (without the 0x50 prefix) */
    annex?: Buffer;

    to: string;
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
    protected readonly _scriptAddress: string;
    /**
     * The tap leaf script
     * @private
     */
    protected tapLeafScript: TapLeafScript | null = null;
    /**
     * The target script redeem
     * @private
     */
    private targetScriptRedeem: P2TRPayment | null = null;
    /**
     * The left over funds script redeem
     * @private
     */
    private leftOverFundsScriptRedeem: P2TRPayment | null = null;
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
    private readonly contractSigner: Signer | ECPairInterface;

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
    private readonly annexData?: Buffer;

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
    public get scriptAddress(): string {
        return this._scriptAddress;
    }

    /**
     * @description Get the P2TR address
     */
    public get p2trAddress(): string {
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
        return toXOnly(Buffer.from(this.contractSigner.publicKey));
    }

    /**
     * Build the transaction
     * @protected
     */
    protected override async buildTransaction(): Promise<void> {
        if (!this.to) {
            this.to = this.getScriptAddress();
        }

        const selectedRedeem: Payment | null = this.contractSigner
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

        await this.addRefundOutput(amountSpent + this.addOptionalOutputsAndGetAmount());
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
                try {
                    transaction.signInput(0, this.contractSigner);
                } catch (e) {}

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
    protected override generateScriptAddress(): P2TRPayment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
            name: PaymentType.P2TR,
        };
    }

    /**
     * Generate the tap data
     * @protected
     */
    protected override generateTapData(): P2TRPayment {
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
            name: PaymentType.P2TR,
        };
    }

    protected getScriptSolution(input: PsbtInput): Buffer[] {
        if (!input.tapScriptSig) {
            throw new Error('Tap script signature is required');
        }

        const witnesses: Buffer[] = [...this.witnesses];
        if (input.tapScriptSig) {
            for (const sig of input.tapScriptSig) {
                witnesses.push(sig.signature);
            }
        }

        return witnesses;
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

        const scriptSolution = this.getScriptSolution(input);
        const witness = scriptSolution
            .concat(this.tapLeafScript.script)
            .concat(this.tapLeafScript.controlBlock);

        if (this.annexData && this.annexData.length > 0) {
            const annex =
                this.annexData[0] === 0x50
                    ? this.annexData
                    : Buffer.concat([Buffer.from([0x50]), this.annexData]);

            witness.push(annex);
        }

        return {
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witness),
        };
    };

    /**
     * Get the public keys for the redeem scripts
     * @private
     */
    private getPubKeys(): Buffer[] {
        const pubkeys = [Buffer.from(this.signer.publicKey)];

        if (this.contractSigner) {
            pubkeys.push(Buffer.from(this.contractSigner.publicKey));
        }

        return pubkeys;
    }

    /**
     * Generate the redeem scripts
     * @private
     */
    private generateRedeemScripts(): void {
        this.targetScriptRedeem = {
            name: PaymentType.P2TR,
            //pubkeys: this.getPubKeys(),
            output: this.compiledTargetScript,
            redeemVersion: 192,
        };

        this.leftOverFundsScriptRedeem = {
            name: PaymentType.P2TR,
            //pubkeys: this.getPubKeys(),
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
