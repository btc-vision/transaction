import { Taptree } from '@btc-vision/bitcoin/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { wBTC } from '../../metadata/contracts/wBTC.js';
import {
    Network,
    Payment,
    payments,
    Psbt,
    PsbtInput,
    PsbtInputExtended,
    PsbtOutputExtended,
} from '@btc-vision/bitcoin';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { IWBTCUTXODocument, PsbtTransaction, VaultUTXOs } from '../processor/PsbtTransaction.js';
import { MultiSignGenerator } from '../../generators/builders/MultiSignGenerator.js';
import { MultiSignTransaction } from './MultiSignTransaction.js';
import { toXOnly } from '@btc-vision/bitcoin/src/psbt/bip371.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import { currentConsensusConfig } from '../../consensus/ConsensusConfig.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { Features } from '../../generators/Features.js';
import { ABICoder } from '../../abi/ABICoder.js';
import { Selector } from '../../utils/types.js';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';

const abiCoder: ABICoder = new ABICoder();
const numsPoint: Buffer = Buffer.from(
    '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
    'hex',
);

/**
 * Unwrap transaction
 * @class UnwrapTransaction
 */
export class UnwrapTransaction extends SharedInteractionTransaction<TransactionType.WBTC_UNWRAP> {
    private static readonly UNWRAP_SELECTOR: Selector = Number(
        '0x' + abiCoder.encodeSelector('burn'),
    );

    public type: TransactionType.WBTC_UNWRAP = TransactionType.WBTC_UNWRAP;

    /**
     * The amount to wrap
     * @private
     */
    public readonly amount: bigint;

    /**
     * The compiled target script
     * @protected
     */
    protected readonly compiledTargetScript: Buffer;
    /**
     * The script tree
     * @protected
     */
    protected readonly scriptTree: Taptree;
    /**
     * The sighash types for the transaction
     * @protected
     */
    protected sighashTypes: number[] = [];
    /**
     * Contract secret for the interaction
     * @protected
     */
    protected readonly contractSecret: Buffer;
    /**
     * The vault UTXOs
     * @protected
     */
    protected readonly vaultUTXOs: VaultUTXOs[];

    /**
     * Estimated unwrap loss due to bitcoin fees in satoshis.
     * @protected
     */
    protected readonly estimatedFeeLoss: bigint = 0n;

    /**
     * The wBTC contract
     * @private
     */
    private readonly wbtc: wBTC;
    private readonly calculatedSignHash: number = PsbtTransaction.calculateSignHash(
        this.sighashTypes,
    );

    public constructor(parameters: IUnwrapParameters) {
        if (parameters.amount < TransactionBuilder.MINIMUM_DUST) {
            throw new Error('Amount is below dust limit');
        }

        parameters.disableAutoRefund = true; // we have to disable auto refund for this transaction, so it does not create an unwanted output.
        parameters.calldata = UnwrapTransaction.generateBurnCalldata(parameters.amount);

        super(parameters);

        this.wbtc = new wBTC(parameters.network, parameters.chainId);
        this.to = this.wbtc.getAddress();

        this.vaultUTXOs = parameters.unwrapUTXOs;
        this.estimatedFeeLoss = UnwrapTransaction.preEstimateTaprootTransactionFees(
            BigInt(this.feeRate),
            this.calculateNumInputs(this.vaultUTXOs),
            2n,
            this.calculateNumSignatures(this.vaultUTXOs),
            65n,
            this.calculateNumEmptyWitnesses(this.vaultUTXOs),
        );

        this.amount = parameters.amount;
        this.contractSecret = this.generateSecret();

        this.calldataGenerator = new CalldataGenerator(
            Buffer.from(this.signer.publicKey),
            this.scriptSignerXOnlyPubKey(),
            this.network,
        );

        this.compiledTargetScript = this.calldataGenerator.compile(
            this.calldata,
            this.contractSecret,
            [Features.UNWRAP],
        );

        this.scriptTree = this.getScriptTree();
        this.internalInit();
    }

    /**
     * Generate a valid wBTC calldata
     * @param {bigint} amount - The amount to wrap
     * @private
     * @returns {Buffer} - The calldata
     */
    public static generateBurnCalldata(amount: bigint): Buffer {
        if (!amount) throw new Error('Amount is required');

        const bufWriter: BinaryWriter = new BinaryWriter();
        bufWriter.writeSelector(UnwrapTransaction.UNWRAP_SELECTOR);
        bufWriter.writeU256(amount);

        return Buffer.from(bufWriter.getBuffer());
    }

    /**
     * @description Signs the transaction
     * @public
     * @returns {Promise<Psbt>} - The signed transaction in hex format
     * @throws {Error} - If something went wrong
     */
    public async signPSBT(): Promise<Psbt> {
        if (this.to && !EcKeyPair.verifyContractAddress(this.to, this.network)) {
            throw new Error(
                'Invalid contract address. The contract address must be a taproot address.',
            );
        }

        if (!this.vaultUTXOs.length) {
            throw new Error('No vault UTXOs provided');
        }

        await this.buildTransaction();
        this.ignoreSignatureError();
        this.mergeVaults();

        const builtTx = await this.internalBuildTransaction(this.transaction);
        if (builtTx) {
            return this.transaction;
        }

        throw new Error('Could not sign transaction');
    }

    public getRefund(): bigint {
        let losses: bigint = -currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT;

        for (const vault of this.vaultUTXOs) {
            for (let i = 0; i < vault.utxos.length; i++) {
                losses += currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT;
            }
        }

        // Since we are creating one output when consolidating, we need to add the fee for that output.
        return losses;
    }

    /**
     * @description Get the estimated unwrap loss due to bitcoin fees in satoshis.
     * @description If the number is negative, it means the user will get a refund.
     * @description If the number is positive, it means the user will lose that amount.
     * @public
     * @returns {bigint} - The estimated fee loss or refund
     */
    public getFeeLossOrRefund(): bigint {
        const refund: bigint = this.getRefund();

        return refund - this.estimatedFeeLoss;
    }

    /**
     * @description Merge vault UTXOs into the transaction
     * @protected
     */
    protected mergeVaults(): void {
        const totalInputAmount: bigint = this.getVaultTotalOutputAmount(this.vaultUTXOs);

        let refund: bigint = this.getRefund();
        const outputLeftAmount = totalInputAmount - refund - this.amount;

        if (outputLeftAmount === currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT) {
            refund += currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT;
        } else if (outputLeftAmount < currentConsensusConfig.VAULT_MINIMUM_AMOUNT) {
            throw new Error(
                `Output left amount is below the minimum amount: ${outputLeftAmount} below ${currentConsensusConfig.VAULT_MINIMUM_AMOUNT}`,
            );
        }

        const outAmount: bigint = this.amount + refund - this.estimatedFeeLoss;
        const bestVault = BitcoinUtils.findVaultWithMostPublicKeys(this.vaultUTXOs);
        if (!bestVault) {
            throw new Error('No vaults provided');
        }

        const hasConsolidation: boolean =
            outputLeftAmount > currentConsensusConfig.VAULT_MINIMUM_AMOUNT &&
            outputLeftAmount - currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT !== 0n;

        if (hasConsolidation) {
            this.success(`Consolidating output with ${outputLeftAmount} sat.`);
        } else {
            this.warn(`No consolidation in this transaction.`);
        }

        if (
            outputLeftAmount - currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT !==
            0n
        ) {
            // If the amount left is 0, we don't consolidate the output.
            this.addOutput({
                address: bestVault.vault,
                value: Number(outputLeftAmount),
            });
        }

        if (outAmount < TransactionBuilder.MINIMUM_DUST) {
            throw new Error(
                `Amount is below dust limit. The requested amount can not be unwrapped since, after fees, it is below the dust limit. Dust: ${outAmount} sat. Are your bitcoin fees too high?`,
            );
        }

        const percentageLossOverInitialAmount = (outAmount * 100n) / this.amount;
        if (percentageLossOverInitialAmount <= 60n) {
            // For user safety, we don't allow more than 60% loss over the initial amount.
            throw new Error(
                `For user safety, OPNet will decline this transaction since you will lose ${100n - percentageLossOverInitialAmount}% of your btc by doing this transaction due to bitcoin fees. Are your bitcoin fees too high?`,
            );
        }

        this.addOutput({
            address: this.from,
            value: Number(outAmount),
        });

        for (const vault of this.vaultUTXOs) {
            this.addVaultInputs(vault);
        }
    }

    protected calculateNumEmptyWitnesses(vault: VaultUTXOs[]): bigint {
        let numSignatures = 0n;
        for (const v of vault) {
            numSignatures += BigInt(v.publicKeys.length - v.minimum) * BigInt(v.utxos.length);
        }

        return numSignatures;
    }

    protected calculateNumSignatures(vault: VaultUTXOs[]): bigint {
        let numSignatures = 0n;
        for (const v of vault) {
            numSignatures += BigInt(v.minimum * v.utxos.length);
        }

        return numSignatures;
    }

    protected calculateNumInputs(vault: VaultUTXOs[]): bigint {
        let numSignatures = 0n;
        for (const v of vault) {
            numSignatures += BigInt(v.utxos.length);
        }

        return numSignatures;
    }

    /**
     * Converts the public key to x-only.
     * @protected
     * @returns {Buffer}
     */
    protected internalPubKeyToXOnly(): Buffer {
        return toXOnly(numsPoint);
    }

    /**
     * Generate an input for a vault UTXO
     * @param {Buffer[]} pubkeys The public keys
     * @param {number} minimumSignatures The minimum number of signatures
     * @protected
     * @returns {Taptree} The tap tree
     * @throws {Error} If something went wrong
     */
    protected generateTapDataForInput(
        pubkeys: Buffer[],
        minimumSignatures: number,
    ): {
        internalPubkey: Buffer;
        network: Network;
        scriptTree: Taptree;
        redeem: Payment;
    } {
        const compiledTargetScript = MultiSignGenerator.compile(pubkeys, minimumSignatures);
        const scriptTree: Taptree = [
            {
                output: compiledTargetScript,
                version: 192,
            },
            {
                output: MultiSignTransaction.LOCK_LEAF_SCRIPT,
                version: 192,
            },
        ];

        const redeem: Payment = {
            output: compiledTargetScript,
            redeemVersion: 192,
        };

        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: scriptTree,
            redeem: redeem,
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
            toXOnly(Buffer.from(this.signer.publicKey)),
            input.tapScriptSig[0].signature,
            input.tapScriptSig[1].signature,
        ];
    }

    /**
     * Builds the transaction.
     * @param {Psbt} transaction - The transaction to build
     * @param checkPartialSigs
     * @protected
     * @returns {Promise<boolean>}
     * @throws {Error} - If something went wrong while building the transaction
     */
    protected async internalBuildTransaction(
        transaction: Psbt,
        checkPartialSigs: boolean = false,
    ): Promise<boolean> {
        if (transaction.data.inputs.length === 0) {
            const inputs: PsbtInputExtended[] = this.getInputs();
            const outputs: PsbtOutputExtended[] = this.getOutputs();

            transaction.setMaximumFeeRate(this._maximumFeeRate);
            transaction.addInputs(inputs, checkPartialSigs);

            for (let i = 0; i < this.updateInputs.length; i++) {
                transaction.updateInput(i, this.updateInputs[i]);
            }

            transaction.addOutputs(outputs);
        }

        try {
            try {
                await this.signInputs(transaction);
            } catch (e) {
                console.log(e);
            }

            if (this.finalized) {
                this.transactionFee = BigInt(transaction.getFee());
            }

            return true;
        } catch (e) {
            const err: Error = e as Error;

            this.error(
                `[internalBuildTransaction] Something went wrong while getting building the transaction: ${err.stack}`,
            );
        }

        return false;
    }

    /**
     * @description Add a vault UTXO to the transaction
     * @private
     */
    private addVaultUTXO(
        utxo: IWBTCUTXODocument,
        pubkeys: Buffer[],
        minimumSignatures: number,
    ): void {
        const tapInput = this.generateTapDataForInput(pubkeys, minimumSignatures);
        const tap = payments.p2tr(tapInput);

        if (!tap.witness) throw new Error('Failed to generate taproot witness');

        const controlBlock = tap.witness[tap.witness.length - 1];
        const input: PsbtInputExtended = {
            hash: utxo.hash,
            index: utxo.outputIndex,
            witnessUtxo: {
                script: Buffer.from(utxo.output, 'base64'),
                value: Number(utxo.value),
            },
            sequence: this.sequence,
            tapLeafScript: [
                {
                    leafVersion: tapInput.redeem.redeemVersion as number,
                    script: tapInput.redeem.output as Buffer,
                    controlBlock: controlBlock,
                },
            ],
        };

        if (this.calculatedSignHash) {
            input.sighashType = this.calculatedSignHash;
        }

        this.addInput(input);
    }

    /**
     * @description Add vault inputs to the transaction
     * @param {VaultUTXOs} vault The vault UTXOs
     * @private
     */
    private addVaultInputs(vault: VaultUTXOs): void {
        const pubKeys = vault.publicKeys.map((key) => Buffer.from(key, 'base64'));

        for (const utxo of vault.utxos) {
            this.addVaultUTXO(utxo, pubKeys, vault.minimum);
        }
    }

    /**
     * @description Calculate the amount left to refund to the first vault.
     * @param {VaultUTXOs[]} vaults The vaults
     * @private
     * @returns {bigint} The amount left
     */
    private calculateOutputLeftAmountFromVaults(vaults: VaultUTXOs[]): bigint {
        const total = this.getVaultTotalOutputAmount(vaults);

        return total - this.amount;
    }

    /**
     * Get the total output amount from the vaults
     * @description Get the total output amount from the vaults
     * @param {VaultUTXOs[]} vaults The vaults
     * @private
     * @returns {bigint} The total output amount
     */
    private getVaultTotalOutputAmount(vaults: VaultUTXOs[]): bigint {
        let total = BigInt(0);
        for (const vault of vaults) {
            for (const utxo of vault.utxos) {
                total += BigInt(utxo.value);
            }
        }

        return total;
    }
}
