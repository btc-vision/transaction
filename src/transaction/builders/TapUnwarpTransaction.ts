import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { ABICoder, BinaryWriter, Selector } from '@btc-vision/bsi-binary';
import { wBTC } from '../../metadata/contracts/wBTC.js';
import bitcoin, { Payment, payments, Psbt, Transaction } from 'bitcoinjs-lib';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { IWBTCUTXODocument, PsbtTransaction, VaultUTXOs } from '../processor/PsbtTransaction.js';
import { PsbtInputExtended, PsbtOutputExtended } from '../interfaces/Tap.js';
import * as ecc from '@bitcoinerlab/secp256k1';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { MultiSignGenerator } from '../../generators/builders/MultiSignGenerator.js';
import { MultiSignTransaction } from './MultiSignTransaction.js';

const abiCoder: ABICoder = new ABICoder();

/**
 * Unwrap transaction
 * @class TapUnwrapTransaction
 */
export class TapUnwrapTransaction extends SharedInteractionTransaction<TransactionType.WBTC_UNWRAP> {
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
     * Scripts
     */
    protected readonly numsPoint = Buffer.from(
        '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
        'hex',
    );

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
        parameters.calldata = TapUnwrapTransaction.generateBurnCalldata(parameters.amount);

        super(parameters);

        this.wbtc = new wBTC(parameters.network);
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
        bufWriter.writeSelector(TapUnwrapTransaction.UNWRAP_SELECTOR);
        bufWriter.writeU256(amount);

        return Buffer.from(bufWriter.getBuffer());
    }

    public tweakScalarPoints(): Uint8Array {
        const r = bitcoin.crypto.sha256(Buffer.from('WTF_IS_OP_NET!', 'utf-8'));
        const rG = ecc.pointMultiply(
            Buffer.from(EcKeyPair.fromPrivateKey(r).publicKey.subarray(1)),
            r,
        );

        if (!rG) throw new Error('Failed to tweak rG');

        const tweaked = ecc.pointAdd(this.numsPoint, rG);
        if (!tweaked) throw new Error('Failed to tweak rG');

        return Buffer.from(tweaked);
    }

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

        if (this.signed) throw new Error('Transaction is already signed');
        this.signed = true;

        this.buildTransaction();
        this.ignoreSignatureError();

        this.mergeVaults(this.vaultUTXOs);

        const builtTx = this.internalBuildTransaction(this.transaction);
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
    public mergeVaults(input: VaultUTXOs[]): void {
        const firstVault = input[0];
        if (!firstVault) {
            throw new Error('No vaults provided');
        }

        const outputLeftAmount = this.calculateOutputLeftAmountFromVaults(input);
        if (outputLeftAmount < 0) {
            throw new Error(
                `Output left amount is negative ${outputLeftAmount} for vault ${firstVault.vault}`,
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
            this.addVaultInputs(vault);
        }
    }

    protected generateTapDataForInput(
        pubkeys: Buffer[],
        minimumSignatures: number,
    ): {
        internalPubkey: Buffer;
        network: bitcoin.Network;
        scriptTree: Taptree;
        redeem: Payment;
    } {
        const compiledTargetScript = MultiSignGenerator.compile(
            pubkeys,
            minimumSignatures,
            //toXOnly(this.signer.publicKey),
        );

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
            internalPubkey: toXOnly(this.numsPoint), //this.internalPubKeyToXOnly(),
            network: this.network,
            scriptTree: scriptTree,
            redeem: redeem,
        };
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
            this.signInput(transaction, transaction.data.inputs[0], 0, this.scriptSigner);
            this.signInput(transaction, transaction.data.inputs[0], 0);

            transaction.finalizeInput(0, this.customFinalizer);

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
            tapInternalKey: tapInput.internalPubkey,
            sequence: this.sequence,
            tapLeafScript: [
                {
                    leafVersion: tapInput.redeem.redeemVersion as number,
                    script: tapInput.redeem.output as Buffer,
                    controlBlock: controlBlock,
                },
            ],
        };

        /*if (this.sighashTypes) {
            const inputSign = TweakedTransaction.calculateSignHash(this.sighashTypes);
            if (inputSign) input.sighashType = inputSign;
        }

        if (this.calculatedSignHash) {
            input.sighashType = this.calculatedSignHash;
        }*/

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
