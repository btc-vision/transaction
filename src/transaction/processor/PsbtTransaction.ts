import { Network, payments, Psbt, Signer, Transaction } from 'bitcoinjs-lib';
import { ITweakedTransactionData, TweakedTransaction } from '../shared/TweakedTransaction.js';
import { PsbtInputExtended, PsbtOutputExtended } from '../interfaces/Tap.js';
import { Address } from '@btc-vision/bsi-binary';

export interface PsbtTransactionData extends ITweakedTransactionData {
    readonly psbt: Psbt;
    readonly signer: Signer;
    readonly network: Network;
    readonly receiver: Address;
    readonly amountRequested: bigint;
    readonly feesAddition?: bigint;
}

export interface IWBTCUTXODocument {
    readonly vault: Address;
    readonly blockId: bigint;

    readonly hash: string;
    readonly value: bigint;
    readonly outputIndex: number;

    readonly output: string;
}

export interface VaultUTXOs {
    readonly vault: Address;
    readonly publicKeys: Address[];
    readonly minimum: number;
    readonly utxos: IWBTCUTXODocument[];
}

export type FromBase64Params = Omit<PsbtTransactionData, 'psbt'>;

/**
 * @description PSBT Transaction processor.
 * */
export class PsbtTransaction extends TweakedTransaction {
    public readonly logColor: string = '#00ffe1';

    public feesAddition: bigint = 80000n; // add 80000 satoshis to the fees

    /**
     * @description The transaction
     * @protected
     */
    protected readonly transaction: Psbt;

    /**
     * @description Sign hash types
     * @protected
     */
    protected readonly sighashTypes: number[] | undefined = [
        Transaction.SIGHASH_ALL,
        Transaction.SIGHASH_ANYONECANPAY,
    ];
    
    /**
     * @description The receiver
     * @protected
     */
    protected readonly receiver: Address;

    protected readonly amountRequested: bigint;

    constructor(data: PsbtTransactionData) {
        super(data);

        if (!data.amountRequested) {
            throw new Error('Amount requested is required');
        }

        this.signer = data.signer;
        this.network = data.network;
        this.amountRequested = data.amountRequested;
        this.receiver = data.receiver;
        this.feesAddition = data.feesAddition || this.feesAddition;

        this.transaction = data.psbt;

        this.tweakSigner();
        this.internalInit();
    }

    public static fromBase64(data: string, params: FromBase64Params): PsbtTransaction {
        const psbt = Psbt.fromBase64(data, {
            network: params.network,
        });

        return new PsbtTransaction({
            ...params,
            psbt,
        });
    }

    /**
     * @description Add an input to the transaction
     * @param input
     */
    public addInput(input: PsbtInputExtended): void {
        this.transaction.addInput(input);
    }

    /**
     * @description Add an output to the transaction
     * @param output
     */
    public addOutput(output: PsbtOutputExtended): void {
        console.log('Adding output', output);
        this.transaction.addOutput(output);
    }

    /**
     * @description Merge vault UTXOs into the transaction
     * @param {VaultUTXOs[]} input The vault UTXOs
     * @param {Signer} [firstSigner] The first signer
     * @public
     */
    public mergeVaults(input: VaultUTXOs[], firstSigner?: Signer): void {
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

        console.log('MAX is', this.getTotalOutputAmount(input));

        this.addOutput({
            address: firstVault.vault,
            value: Number(outputLeftAmount),
        });

        this.addOutput({
            address: this.receiver,
            value: Number(this.amountRequested - this.feesAddition),
        });

        for (const vault of input) {
            this.addVaultInputs(vault, firstSigner);
        }
    }

    /**
     * Attempt to sign all inputs
     */
    public attemptSignAllInputs(): boolean {
        let signed = false;
        for (let i = 0; i < this.transaction.data.inputs.length; i++) {
            const input = this.transaction.data.inputs[i];
            if (!input.partialSig) {
                continue;
            }

            try {
                this.signInput(this.transaction, input, i, this.signer);
                signed = true;
            } catch (e) {}
        }

        return signed;
    }

    /**
     * Attempt to finalize all inputs
     * @returns {boolean} True if all inputs were finalized
     */
    public attemptFinalizeInputs(): boolean {
        try {
            const inputs = this.transaction.txInputs;
            for (let i = 1; i < inputs.length; i++) {
                this.transaction.finalizeInput(i);
            }

            return true;
        } catch (e) {
            this.warn((e as Error).stack);
            return false;
        }
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

    private getTotalOutputAmount(vaults: VaultUTXOs[]): bigint {
        let total = BigInt(0);
        for (const vault of vaults) {
            for (const utxo of vault.utxos) {
                total += BigInt(utxo.value);
            }
        }

        return total;
    }

    /**
     * @description Calculate the amount left to refund to the first vault.
     * @param {VaultUTXOs[]} vaults The vaults
     * @private
     * @returns {bigint} The amount left
     */
    private calculateOutputLeftAmountFromVaults(vaults: VaultUTXOs[]): bigint {
        const total = this.getTotalOutputAmount(vaults);

        return total - this.amountRequested;
    }

    /**
     * @description Add vault inputs to the transaction
     * @param {VaultUTXOs} vault The vault UTXOs
     * @param {Signer} [firstSigner] The first signer
     * @private
     */
    private addVaultInputs(vault: VaultUTXOs, firstSigner: Signer = this.signer): void {
        const p2wshOutput = this.generateMultiSignRedeemScript(vault.publicKeys, vault.minimum);
        for (const utxo of vault.utxos) {
            const inputIndex = this.transaction.inputCount;
            this.addVaultUTXO(utxo, p2wshOutput);

            if (firstSigner) {
                this.log(
                    `Signing input ${inputIndex} with ${firstSigner.publicKey.toString('hex')}`,
                );

                // we don't care if we fail to sign the input
                try {
                    this.signInput(
                        this.transaction,
                        this.transaction.data.inputs[inputIndex],
                        inputIndex,
                        this.signer,
                    );

                    this.log(
                        `Signed input ${inputIndex} with ${firstSigner.publicKey.toString('hex')}`,
                    );
                } catch (e) {
                    console.log('can not sign.', e);

                    this.warn(
                        `Failed to sign input ${inputIndex} with ${firstSigner.publicKey.toString('hex')}`,
                    );
                }
            }
        }
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
            redeemScript: witness.redeemScript,
        };

        console.log('Adding input2', input, utxo);

        if (this.sighashTypes) {
            input.sighashType = this.calculateSignHash();
        }

        this.addInput(input);
    }
}
