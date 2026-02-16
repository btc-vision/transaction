import { TransactionType } from '../enums/TransactionType.js';
import type { IDeploymentParameters } from '../interfaces/ITransactionParameters.js';
import {
    concat,
    crypto as bitCrypto,
    type FinalScriptsFunc,
    fromHex,
    type P2MRPayment,
    type P2TRPayment,
    PaymentType,
    Psbt,
    type PsbtInput,
    type Script,
    type Signer,
    type TapScriptSig,
    type Taptree,
    toHex,
    toXOnly,
} from '@btc-vision/bitcoin';
import { TransactionBuilder } from './TransactionBuilder.js';
import type { TapPayment } from '../shared/TweakedTransaction.js';
import type { TapLeafScript } from '../interfaces/Tap.js';
import {
    DeploymentGenerator,
    versionBuffer,
} from '../../generators/builders/DeploymentGenerator.js';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { Compressor } from '../../bytecode/Compressor.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { type UniversalSigner } from '@btc-vision/ecpair';
import { isUniversalSigner } from '../../signer/TweakedSigner.js';
import { Address } from '../../keypair/Address.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';
import { TimeLockGenerator } from '../mineable/TimelockGenerator.js';
import type { IChallengeSolution } from '../../epoch/interfaces/IChallengeSolution.js';
import { type Feature, FeaturePriority, Features } from '../../generators/Features.js';
import type { IP2WSHAddress } from '../mineable/IP2WSHAddress.js';

export class DeploymentTransaction extends TransactionBuilder<TransactionType.DEPLOYMENT> {
    public static readonly MAXIMUM_CONTRACT_SIZE = 128 * 1024;

    public type: TransactionType.DEPLOYMENT = TransactionType.DEPLOYMENT;

    protected readonly challenge: IChallengeSolution;
    protected readonly epochChallenge: IP2WSHAddress;

    /**
     * The contract address
     * @protected
     */
    protected readonly _contractAddress: Address;
    /**
     * The tap leaf script
     * @private
     */
    protected override tapLeafScript: TapLeafScript | null = null;
    private readonly deploymentVersion: number = 0x00;
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
    private deploymentGenerator: DeploymentGenerator;

    /**
     * The contract seed
     * @private
     */
    private readonly contractSeed: Uint8Array;

    /**
     * The contract bytecode
     * @private
     */
    private readonly bytecode: Uint8Array;

    /**
     * Constructor calldata
     * @private
     */
    private readonly calldata?: Uint8Array;

    /**
     * The contract signer
     * @private
     */
    private readonly contractSigner: Signer | UniversalSigner;

    /**
     * The contract public key
     * @private
     */
    private readonly _contractPubKey: string;

    /**
     * The contract salt random bytes
     * @private
     */
    private readonly randomBytes: Uint8Array;
    private _computedAddress: string | undefined;

    public constructor(parameters: IDeploymentParameters) {
        super(parameters);

        if (!this.hashedPublicKey) {
            throw new Error('MLDSA signer must be defined to deploy a contract.');
        }

        this.bytecode = Compressor.compress(
            new Uint8Array([...versionBuffer, ...parameters.bytecode]),
        );

        this.verifyBytecode();

        if (parameters.calldata) {
            this.calldata = parameters.calldata;
            this.verifyCalldata();
        }

        if (!parameters.challenge) throw new Error('Challenge solution is required');

        this.randomBytes = parameters.randomBytes || BitcoinUtils.rndBytes();
        this.challenge = parameters.challenge;

        this.LOCK_LEAF_SCRIPT = this.defineLockScript();
        this.epochChallenge = TimeLockGenerator.generateTimeLockAddress(
            this.challenge.publicKey.originalPublicKeyBuffer(),
            this.network,
        );

        this.contractSeed = this.getContractSeed();
        this.contractSigner = EcKeyPair.fromSeedKeyPair(this.contractSeed, this.network);

        this.deploymentGenerator = new DeploymentGenerator(
            this.signer.publicKey,
            this.contractSignerXOnlyPubKey(),
            this.network,
        );

        if (parameters.compiledTargetScript) {
            if (parameters.compiledTargetScript instanceof Uint8Array) {
                this.compiledTargetScript = parameters.compiledTargetScript;
            } else if (typeof parameters.compiledTargetScript === 'string') {
                this.compiledTargetScript = fromHex(parameters.compiledTargetScript);
            } else {
                throw new Error('Invalid compiled target script format.');
            }
        } else {
            this.compiledTargetScript = this.deploymentGenerator.compile(
                this.bytecode,
                this.randomBytes,
                this.challenge,
                this.priorityFee,
                this.calldata,
                this.generateFeatures(parameters),
            );
        }

        this.scriptTree = this.getScriptTree();

        this.internalInit();

        this._contractPubKey = '0x' + toHex(this.contractSeed);
        this._contractAddress = new Address(this.contractSeed);
    }

    /**
     * Get the contract public key
     */
    public get contractPubKey(): string {
        return this._contractPubKey;
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
    public get p2trAddress(): string {
        return this.to || this.getScriptAddress();
    }

    public exportCompiledTargetScript(): Uint8Array {
        return this.compiledTargetScript;
    }

    /**
     * Get the random bytes used for the interaction
     * @returns {Uint8Array} The random bytes
     */
    public getRndBytes(): Uint8Array {
        return this.randomBytes;
    }

    /**
     * Get the contract bytecode
     * @returns {Uint8Array} The contract bytecode
     */
    public getChallenge(): IChallengeSolution {
        return this.challenge;
    }

    public getContractAddress(): string {
        if (this._computedAddress) {
            return this._computedAddress;
        }

        this._computedAddress = EcKeyPair.p2op(
            this.contractSeed,
            this.network,
            this.deploymentVersion,
        );

        return this._computedAddress;
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
        this.addFeeToOutput(amountSpent, this.getContractAddress(), this.epochChallenge, true);

        await this.addRefundOutput(amountSpent + this.addOptionalOutputsAndGetAmount());
    }

    protected override async signInputsWalletBased(transaction: Psbt): Promise<void> {
        const signer: UnisatSigner = this.signer as UnisatSigner;

        // first, we sign the first input with the script signer.
        await this.signInput(
            transaction,
            transaction.data.inputs[0] as PsbtInput,
            0,
            this.contractSigner,
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

        if ('multiSignPsbt' in this.signer) {
            await this.signInputsWalletBased(transaction);
            return;
        }

        // Input 0: sequential (contractSigner + main signer, custom finalizer)
        transaction.signInput(0, this.contractSigner);
        transaction.signInput(0, this.getSignerKey());
        transaction.finalizeInput(0, this.customFinalizer.bind(this));

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
    protected override generateScriptAddress(): TapPayment {
        if (this.useP2MR) {
            return {
                name: PaymentType.P2MR,
                network: this.network,
                scriptTree: this.scriptTree,
            } as P2MRPayment;
        }

        return {
            name: PaymentType.P2TR,
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
        };
    }

    /**
     * Generate the tap data
     * @protected
     */
    protected override generateTapData(): TapPayment {
        const selectedRedeem = this.contractSigner
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
                name: PaymentType.P2MR,
                network: this.network,
                scriptTree: this.scriptTree,
                redeem: selectedRedeem,
            } as P2MRPayment;
        }

        return {
            name: PaymentType.P2TR,
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: this.scriptTree,
            redeem: selectedRedeem,
        };
    }

    private generateFeatures(parameters: IDeploymentParameters): Feature<Features>[] {
        const features: Feature<Features>[] = [];

        const submission = parameters.challenge.getSubmission();
        if (submission) {
            features.push({
                priority: FeaturePriority.MLDSA_LINK_PUBKEY,
                opcode: Features.EPOCH_SUBMISSION,
                data: submission,
            });
        }

        if (parameters.revealMLDSAPublicKey && !parameters.linkMLDSAPublicKeyToAddress) {
            throw new Error(
                'To reveal the MLDSA public key, you must set linkMLDSAPublicKeyToAddress to true.',
            );
        }

        if (parameters.linkMLDSAPublicKeyToAddress) {
            this.generateMLDSALinkRequest(parameters, features);
        }

        return features;
    }

    private verifyCalldata(): void {
        if (
            this.calldata &&
            this.calldata.length > SharedInteractionTransaction.MAXIMUM_CALLDATA_SIZE
        ) {
            throw new Error('Calldata size overflow.');
        }
    }

    private verifyBytecode(): void {
        if (!this.bytecode) throw new Error('Bytecode is required');

        if (this.bytecode.length > DeploymentTransaction.MAXIMUM_CONTRACT_SIZE) {
            throw new Error('Contract size overflow.');
        }
    }

    /**
     * Generate the contract seed for the deployment
     * @private
     */
    private getContractSeed(): Uint8Array {
        if (!this.bytecode) {
            throw new Error('Bytecode is required');
        }

        // Concatenate deployer pubkey, salt, and sha256(bytecode)
        const deployerPubKey = this.internalPubKeyToXOnly();
        const salt = bitCrypto.hash256(this.randomBytes);
        const sha256OfBytecode = bitCrypto.hash256(this.bytecode);
        const buf = concat([deployerPubKey, salt, sha256OfBytecode]);

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
            (input.tapScriptSig[0] as TapScriptSig).signature,
            (input.tapScriptSig[1] as TapScriptSig).signature,
        ];

        const witness = scriptSolution
            .concat(this.tapLeafScript.script)
            .concat(this.tapLeafScript.controlBlock);

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
