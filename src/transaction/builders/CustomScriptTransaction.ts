import {
    crypto as bitCrypto,
    type FinalScriptsFunc,
    type P2TRPayment,
    PaymentType,
    Psbt,
    type PsbtInput,
    type Script,
    type Signer,
    type Taptree,
    toSatoshi,
    toXOnly,
} from '@btc-vision/bitcoin';
import { TransactionType } from '../enums/TransactionType.js';
import type { TapLeafScript } from '../interfaces/Tap.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { CustomGenerator } from '../../generators/builders/CustomGenerator.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { AddressGenerator } from '../../generators/AddressGenerator.js';
import { type UniversalSigner } from '@btc-vision/ecpair';
import { isUniversalSigner } from '../../signer/TweakedSigner.js';
import type { ICustomTransactionParameters } from '../interfaces/ICustomTransactionParameters.js';

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
    protected override tapLeafScript: TapLeafScript | null = null;
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
    private readonly compiledTargetScript: Uint8Array;
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
    private readonly scriptSeed: Uint8Array;

    /**
     * The contract signer
     * @private
     */
    private readonly contractSigner: Signer | UniversalSigner;

    /**
     * The contract salt random bytes
     * @private
     */
    private readonly randomBytes: Uint8Array;

    /**
     * The witnesses
     * @private
     */
    private readonly witnesses: Uint8Array[];
    private readonly annexData?: Uint8Array;

    public constructor(parameters: ICustomTransactionParameters) {
        super(parameters);

        if (!parameters.script) throw new Error('Bitcoin script is required');
        if (!parameters.witnesses) throw new Error('Witness(es) are required');

        this.witnesses = parameters.witnesses;
        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();
        this.LOCK_LEAF_SCRIPT = this.defineLockScript();

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

    public exportCompiledTargetScript(): Uint8Array {
        return this.compiledTargetScript;
    }

    /**
     * Get the random bytes used for the interaction
     * @returns {Buffer} The random bytes
     */
    public getRndBytes(): Uint8Array {
        return this.randomBytes;
    }

    /**
     * Get the contract signer public key
     * @protected
     */
    protected contractSignerXOnlyPubKey(): Uint8Array {
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

        const selectedRedeem: P2TRPayment | null = this.contractSigner
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
            value: toSatoshi(amountSpent),
            address: this.to,
        });

        await this.addRefundOutput(amountSpent + this.addOptionalOutputsAndGetAmount());
    }

    /**
     * Sign the inputs
     * @param {Psbt} transaction The transaction to sign
     * @protected
     */
    protected override async signInputs(transaction: Psbt): Promise<void> {
        if (!this.contractSigner) {
            await super.signInputs(transaction);

            return;
        }

        // Input 0: sequential (contractSigner + main signer, custom finalizer)
        try {
            transaction.signInput(0, this.contractSigner);
        } catch {
            // contractSigner may fail for some script types
        }
        transaction.signInput(0, this.getSignerKey());
        transaction.finalizeInput(0, this.customFinalizer);

        // Inputs 1+: parallel key-path if available, then sequential for remaining
        const signedIndices = new Set<number>([0]);

        if (this.canUseParallelSigning && isUniversalSigner(this.signer)) {
            try {
                const result = await this.signKeyPathInputsParallel(transaction, new Set([0]));
                if (result.success) {
                    for (const idx of result.signatures.keys()) signedIndices.add(idx);
                }
            } catch (e) {
                this.error(`Parallel signing failed: ${(e as Error).message}`);
            }
        }

        for (let i = 1; i < transaction.data.inputs.length; i++) {
            if (!signedIndices.has(i)) {
                transaction.signInput(i, this.getSignerKey());
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

    protected getScriptSolution(input: PsbtInput): Uint8Array[] {
        if (!input.tapScriptSig) {
            throw new Error('Tap script signature is required');
        }

        const witnesses: Uint8Array[] = [...this.witnesses];
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
    private getContractSeed(): Uint8Array {
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
            let annex: Uint8Array;
            if (this.annexData[0] === 0x50) {
                annex = this.annexData;
            } else {
                const prefixed = new Uint8Array(this.annexData.length + 1);
                prefixed[0] = 0x50;
                prefixed.set(this.annexData, 1);
                annex = prefixed;
            }
            witness.push(annex);
        }

        return {
            finalScriptWitness: TransactionBuilder.witnessStackToScriptWitness(witness),
        };
    };

    /**
     * Generate the redeem scripts
     * @private
     */
    private generateRedeemScripts(): void {
        this.targetScriptRedeem = {
            name: PaymentType.P2TR,
            //pubkeys: this.getPubKeys(),
            output: this.compiledTargetScript as Script,
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
    private getLeafScript(): Script {
        return this.LOCK_LEAF_SCRIPT;
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
