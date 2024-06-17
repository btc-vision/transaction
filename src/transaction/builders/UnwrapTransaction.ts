import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { ABICoder, BinaryWriter, Selector } from '@btc-vision/bsi-binary';
import { wBTC } from '../../metadata/contracts/wBTC.js';
import { Network, Payment, payments, Psbt, Transaction } from 'bitcoinjs-lib';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { IWBTCUTXODocument, PsbtTransaction, VaultUTXOs } from '../processor/PsbtTransaction.js';
import { PsbtInputExtended, PsbtOutputExtended } from '../interfaces/Tap.js';
import { MultiSignGenerator } from '../../generators/builders/MultiSignGenerator.js';
import { MultiSignTransaction } from './MultiSignTransaction.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { currentConsensusConfig } from '../../consensus/ConsensusConfig.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';

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

        this.wbtc = new wBTC(parameters.network);
        this.to = this.wbtc.getAddress();

        this.vaultUTXOs = parameters.unwrapUTXOs;
        this.estimatedFeeLoss = this.preEstimateTaprootTransactionFees(
            BigInt(this.feeRate),
            this.calculateNumInputs(this.vaultUTXOs),
            2n,
            this.calculateNumSignatures(this.vaultUTXOs),
            64n,
            this.calculateNumEmptyWitnesses(this.vaultUTXOs),
        );

        this.amount = parameters.amount;
        this.contractSecret = this.generateSecret();

        this.calldataGenerator = new CalldataGenerator(
            toXOnly(this.signer.publicKey),
            this.scriptSignerXOnlyPubKey(),
            this.network,
        );

        this.compiledTargetScript = this.calldataGenerator.compile(
            this.calldata,
            this.contractSecret,
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

    /*public tweakScalarPoints(): Uint8Array {
        const key: Uint8Array = (this.signer as ECPairInterface).privateKey as Uint8Array;
        //const r = bitcoin.crypto.sha256(Buffer.from('WTF_IS_OP_NET!', 'utf-8'));
        const rG = ecc.pointMultiply(
            Buffer.from(this.internalPubKeyToXOnly()), //EcKeyPair.fromPrivateKey(r).publicKey.subarray(1)
            key,
        );

        if (!rG) throw new Error('Failed to tweak rG');

        const tweaked = ecc.pointAdd(this.numsPoint, rG);
        if (!tweaked) throw new Error('Failed to tweak rG');

        return Buffer.from(tweaked);
    }*/

    /**
     * @description Signs the transaction
     * @public
     * @returns {Transaction} - The signed transaction in hex format
     * @throws {Error} - If something went wrong
     */
    public signPSBT(): Psbt {
        if (this.to && !EcKeyPair.verifyContractAddress(this.to, this.network)) {
            throw new Error(
                'Invalid contract address. The contract address must be a taproot address.',
            );
        }

        if (!this.vaultUTXOs.length) {
            throw new Error('No vault UTXOs provided');
        }

        this.buildTransaction();
        this.ignoreSignatureError();
        this.mergeVaults();

        const builtTx = this.internalBuildTransaction(this.transaction);
        if (builtTx) {
            return this.transaction;
        }

        throw new Error('Could not sign transaction');
    }

    /**
     * @description Get the estimated unwrap loss due to bitcoin fees in satoshis.
     * @description If the number is negative, it means the user will get a refund.
     * @description If the number is positive, it means the user will lose that amount.
     * @public
     * @returns {bigint} - The estimated fee loss or refund
     */
    public getFeeLossOrRefund(): bigint {
        let losses: bigint = this.estimatedFeeLoss;

        for (let vault of this.vaultUTXOs) {
            for (let i = 0; i < vault.utxos.length; i++) {
                losses -= currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT;
            }
        }

        // Since we are creating one output when consolidating, we need to add the fee for that output.
        return losses + currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT;
    }

    /**
     * @description Merge vault UTXOs into the transaction
     * @protected
     */
    protected mergeVaults(): void {
        let lossOrRefund = this.getFeeLossOrRefund();
        let outputLeftAmount = this.calculateOutputLeftAmountFromVaults(this.vaultUTXOs);
        if (lossOrRefund < 0n) {
            outputLeftAmount += lossOrRefund;
        }

        const bestVault = BitcoinUtils.findVaultWithMostPublicKeys(this.vaultUTXOs);
        if (!bestVault) {
            throw new Error('No vaults provided');
        }

        if (outputLeftAmount < currentConsensusConfig.VAULT_MINIMUM_AMOUNT) {
            throw new Error(
                `Output left amount is below minimum consolidation (${currentConsensusConfig.VAULT_MINIMUM_AMOUNT} sat) amount ${outputLeftAmount} for vault ${bestVault.vault}`,
            );
        }

        if (outputLeftAmount !== 0n) {
            // If the amount left is 0, we don't consolidate the output.
            this.addOutput({
                address: bestVault.vault,
                value: Number(outputLeftAmount),
            });
        } else {
            // Since we are not consolidating the output, we need to refund the user the fees he paid for the consolidation.
            lossOrRefund -= currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT;
        }

        const outAmount: bigint = this.amount - lossOrRefund;
        if (outAmount < TransactionBuilder.MINIMUM_DUST) {
            throw new Error(
                `Amount is below dust limit. The requested amount can not be unwrapped since, after fees, it is below the dust limit. Dust: ${outAmount} sat. Are your bitcoin fees too high?`,
            );
        }

        const percentageLossOverInitialAmount = (lossOrRefund * 100n) / this.amount;
        if (percentageLossOverInitialAmount >= 60n) {
            // For user safety, we don't allow more than 60% loss over the initial amount.
            throw new Error(
                `For user safety, OPNet will decline this transaction since you will lose ${percentageLossOverInitialAmount}% of your btc by doing this transaction due to bitcoin fees. Are your bitcoin fees too high?`,
            );
        }

        this.addOutput({
            address: this.from,
            value: Number(outAmount - currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT),
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
            toXOnly(this.signer.publicKey),
            input.tapScriptSig[0].signature,
            input.tapScriptSig[1].signature,
        ];
    }

    /**
     * Builds the transaction.
     * @param {Psbt} transaction - The transaction to build
     * @protected
     * @returns {boolean}
     * @throws {Error} - If something went wrong while building the transaction
     */
    protected internalBuildTransaction(transaction: Psbt): boolean {
        if (transaction.data.inputs.length === 0) {
            const inputs: PsbtInputExtended[] = this.getInputs();
            const outputs: PsbtOutputExtended[] = this.getOutputs();

            transaction.setMaximumFeeRate(this._maximumFeeRate);
            transaction.addInputs(inputs);

            for (let i = 0; i < this.updateInputs.length; i++) {
                transaction.updateInput(i, this.updateInputs[i]);
            }

            transaction.addOutputs(outputs);
        }

        try {
            try {
                this.signInput(transaction, transaction.data.inputs[0], 0, this.scriptSigner);
                this.signInput(transaction, transaction.data.inputs[0], 0);

                try {
                    transaction.finalizeInput(0, this.customFinalizer);
                } catch (e) {
                    console.log(e);
                }
            } catch (e) {}

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

        this.disableRBF();

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
