import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { ABICoder, BinaryWriter, Selector } from '@btc-vision/bsi-binary';
import { wBTC } from '../../metadata/contracts/wBTC.js';
import { payments, Psbt, Signer } from 'bitcoinjs-lib';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { IWBTCUTXODocument, PsbtTransaction, VaultUTXOs } from '../processor/PsbtTransaction.js';
import { PsbtInputExtended, PsbtOutputExtended } from '../interfaces/Tap.js';
import { currentConsensusConfig } from '../../consensus/ConsensusConfig.js';

const abiCoder: ABICoder = new ABICoder();

/**
 * Unwrap transaction
 * @class UnwrapSegwitTransaction
 */
export class UnwrapSegwitTransaction extends SharedInteractionTransaction<TransactionType.WBTC_UNWRAP> {
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
    protected sighashTypes: number[] = []; //Transaction.SIGHASH_ALL, Transaction.SIGHASH_ANYONECANPAY

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
        parameters.calldata = UnwrapSegwitTransaction.generateBurnCalldata(parameters.amount);

        super(parameters);

        this.wbtc = new wBTC(parameters.network, parameters.chainId);
        this.to = this.wbtc.getAddress();

        this.vaultUTXOs = parameters.unwrapUTXOs;

        this.amount = parameters.amount;
        this.contractSecret = this.generateSecret();

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
        bufWriter.writeSelector(UnwrapSegwitTransaction.UNWRAP_SELECTOR);
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

        if (this.signed) throw new Error('Transaction is already signed');
        this.signed = true;

        await this.buildTransaction();

        this.ignoreSignatureError();
        await this.mergeVaults(this.vaultUTXOs);

        const builtTx = await this.internalBuildTransaction(this.transaction);
        if (builtTx) {
            return this.transaction;
        }

        throw new Error('Could not sign transaction');
    }

    /**
     * @description Merge vault UTXOs into the transaction
     * @param {VaultUTXOs[]} input The vault UTXOs
     * @public
     */
    public async mergeVaults(input: VaultUTXOs[]): Promise<void> {
        const firstVault = input[0];
        if (!firstVault) {
            throw new Error('No vaults provided');
        }

        const total = this.getVaultTotalOutputAmount(input);
        if (total < this.amount) {
            throw new Error(
                `Total vault amount (${total} sat) is less than the amount to unwrap (${this.amount} sat)`,
            );
        }

        const outputLeftAmount = this.calculateOutputLeftAmountFromVaults(input);
        if (
            outputLeftAmount < currentConsensusConfig.VAULT_MINIMUM_AMOUNT &&
            outputLeftAmount !== currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT
        ) {
            throw new Error(
                `Output left amount is below minimum consolidation (${currentConsensusConfig.VAULT_MINIMUM_AMOUNT} sat) amount ${outputLeftAmount} for vault ${firstVault.vault}`,
            );
        }

        this.addOutput({
            address: firstVault.vault,
            value: Number(outputLeftAmount),
        });

        this.addOutput({
            address: this.from,
            value: Number(this.amount),
        });

        for (const vault of input) {
            await this.addVaultInputs(vault);
        }
    }

    /**
     * Builds the transaction.
     * @param {Psbt} transaction - The transaction to build
     * @protected
     * @returns {Promise<boolean>}
     * @throws {Error} - If something went wrong while building the transaction
     */
    protected async internalBuildTransaction(transaction: Psbt, checkPartialSigs: boolean = false): Promise<boolean> {
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
            await this.signInputs(transaction);

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
     * Generate a multi-signature redeem script
     * @param {string[]} publicKeys The public keys
     * @param {number} minimum The minimum number of signatures
     * @protected
     * @returns {{output: Buffer; redeem: Buffer}} The output and redeem script
     */
    protected generateMultiSignRedeemScript(
        publicKeys: string[],
        minimum: number,
    ): { witnessUtxo: Buffer; redeemScript: Buffer; witnessScript: Buffer } {
        const p2ms = payments.p2ms({
            m: minimum,
            pubkeys: publicKeys.map((key) => Buffer.from(key, 'base64')),
            network: this.network,
        });

        const p2wsh = payments.p2wsh({
            redeem: p2ms,
            network: this.network,
        });

        const witnessUtxo = p2wsh.output;
        const redeemScript = p2wsh.redeem?.output;
        const witnessScript = p2ms.output;

        if (!witnessUtxo || !redeemScript || !witnessScript) {
            throw new Error('Failed to generate redeem script');
        }

        return {
            witnessUtxo,
            redeemScript,
            witnessScript,
        };
    }

    /**
     * @description Add a vault UTXO to the transaction
     * @private
     */
    private addVaultUTXO(
        utxo: IWBTCUTXODocument,
        witness: {
            witnessUtxo: Buffer;
            redeemScript: Buffer;
            witnessScript: Buffer;
        },
    ): void {
        const input: PsbtInputExtended = {
            hash: utxo.hash,
            index: utxo.outputIndex,
            witnessUtxo: {
                script: Buffer.from(utxo.output, 'base64'),
                value: Number(utxo.value),
            },
            witnessScript: witness.witnessScript,
            sequence: this.sequence,
        };

        if (this.calculatedSignHash) {
            input.sighashType = this.calculatedSignHash;
        }

        this.addInput(input);
    }

    /**
     * @description Add vault inputs to the transaction
     * @param {VaultUTXOs} vault The vault UTXOs
     * @param {Signer} [firstSigner] The first signer
     * @private
     */
    private async addVaultInputs(
        vault: VaultUTXOs,
        firstSigner: Signer = this.signer,
    ): Promise<void> {
        const p2wshOutput = this.generateMultiSignRedeemScript(vault.publicKeys, vault.minimum);
        for (const utxo of vault.utxos) {
            const inputIndex = this.transaction.inputCount;
            this.addVaultUTXO(utxo, p2wshOutput);

            if (firstSigner) {
                //this.log(
                //    `Signing input ${inputIndex} with ${firstSigner.publicKey.toString('hex')}`,
                //);

                // we don't care if we fail to sign the input
                try {
                    await this.signInput(
                        this.transaction,
                        this.transaction.data.inputs[inputIndex],
                        inputIndex,
                        this.signer,
                    );

                    this.log(
                        `Signed input ${inputIndex} with ${firstSigner.publicKey.toString('hex')}`,
                    );
                } catch (e) {
                    if (!this.ignoreSignatureErrors) {
                        this.warn(
                            `Failed to sign input ${inputIndex} with ${firstSigner.publicKey.toString('hex')} ${(e as Error).message}`,
                        );
                    }
                }
            }
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
