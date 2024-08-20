import { Psbt, Transaction } from 'bitcoinjs-lib';
import {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    IUnwrapParameters,
    IWrapParameters,
} from './interfaces/ITransactionParameters.js';
import { FundingTransaction } from './builders/FundingTransaction.js';
import { Output } from 'bitcoinjs-lib/src/transaction.js';
import { UTXO } from '../utxo/interfaces/IUTXO.js';
import { InteractionTransaction } from './builders/InteractionTransaction.js';
import { DeploymentTransaction } from './builders/DeploymentTransaction.js';
import { Address } from '@btc-vision/bsi-binary';
import { wBTC } from '../metadata/contracts/wBTC.js';
import { WrapTransaction } from './builders/WrapTransaction.js';
import { PSBTTypes } from './psbt/PSBTTypes.js';
import { VaultUTXOs } from './processor/PsbtTransaction.js';
import { UnwrapSegwitTransaction } from './builders/UnwrapSegwitTransaction.js';
import { UnwrapTransaction } from './builders/UnwrapTransaction.js';
import { currentConsensus, currentConsensusConfig } from '../consensus/ConsensusConfig.js';
import { TransactionBuilder } from './builders/TransactionBuilder.js';
import { TransactionType } from './enums/TransactionType.js';

export interface DeploymentResult {
    readonly transaction: [string, string];

    readonly contractAddress: Address;
    readonly p2trAddress: Address;

    readonly utxos: UTXO[];
}

export interface WrapResult {
    readonly transaction: [string, string];
    readonly vaultAddress: Address;
    readonly amount: bigint;
    readonly receiverAddress: Address;
    readonly utxos: UTXO[];
}

export interface FundingTransactionResponse {
    readonly tx: Transaction;
    readonly original: FundingTransaction;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
}

export interface BitcoinTransferResponse {
    readonly tx: string;
    readonly original: FundingTransaction;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
}

export interface UnwrapResult {
    readonly fundingTransaction: string;
    readonly psbt: string;

    /**
     * @description The fee refund or loss.
     * @description If the amount is negative, it means that the user has to pay the difference. The difference is deducted from the amount.
     * @description If the amount is positive, it means that the user will be refunded the difference.
     * @type {bigint}
     */
    readonly feeRefundOrLoss: bigint;

    readonly utxos: UTXO[];
}

export class TransactionFactory {
    constructor() {}

    /**
     * @description Generates the required transactions.
     * @returns {Promise<[string, string]>} - The signed transaction
     */
    public async signInteraction(
        interactionParameters: IInteractionParameters,
    ): Promise<[string, string, UTXO[]]> {
        if (!interactionParameters.to) {
            throw new Error('Field "to" not provided.');
        }

        if (!interactionParameters.from) {
            throw new Error('Field "from" not provided.');
        }

        const preTransaction: InteractionTransaction = new InteractionTransaction({
            ...interactionParameters,
            utxos: [interactionParameters.utxos[0]], // we simulate one input here.
        });

        // we don't sign that transaction, we just need the parameters.

        await preTransaction.generateTransactionMinimalSignatures();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        parameters.utxos = interactionParameters.utxos;
        parameters.amount = await preTransaction.estimateTransactionFees();

        const feeEstimationFundingTransaction = await this.createFundTransaction({ ...parameters });
        if (!feeEstimationFundingTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        parameters.estimatedFees = feeEstimationFundingTransaction.estimatedFees;

        const signedTransaction = await this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        interactionParameters.utxos = this.getUTXOAsTransaction(
            signedTransaction.tx,
            interactionParameters.to,
            0,
        );

        const newParams: IInteractionParameters = {
            ...interactionParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
            estimatedFees: preTransaction.estimatedFees,
        };

        const finalTransaction: InteractionTransaction = new InteractionTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = await finalTransaction.signTransaction();

        return [
            signedTransaction.tx.toHex(),
            outTx.toHex(),
            this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.from, 1), // always 1
        ];
    }

    /**
     * @description Generates the required transactions.
     * @param {IDeploymentParameters} deploymentParameters - The deployment parameters
     * @returns {Promise<DeploymentResult>} - The signed transaction
     */
    public async signDeployment(
        deploymentParameters: IDeploymentParameters,
    ): Promise<DeploymentResult> {
        const preTransaction: DeploymentTransaction = new DeploymentTransaction(
            deploymentParameters,
        );

        // Initial generation
        await preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        const fundingTransaction: FundingTransaction = new FundingTransaction(parameters);
        const signedTransaction: Transaction = await fundingTransaction.signTransaction();
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const out: Output = signedTransaction.outs[0];
        const newUtxo: UTXO = {
            transactionId: signedTransaction.getId(),
            outputIndex: 0, // always 0
            scriptPubKey: {
                hex: out.script.toString('hex'),
                address: preTransaction.getScriptAddress(),
            },
            value: BigInt(out.value),
        };

        const newParams: IDeploymentParameters = {
            ...deploymentParameters,
            utxos: [newUtxo],
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.toBuffer(),
        };

        const finalTransaction: DeploymentTransaction = new DeploymentTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = await finalTransaction.signTransaction();

        const out2: Output = signedTransaction.outs[1];
        const refundUTXO: UTXO = {
            transactionId: signedTransaction.getId(),
            outputIndex: 1, // always 1
            scriptPubKey: {
                hex: out2.script.toString('hex'),
                address: deploymentParameters.from,
            },
            value: BigInt(out2.value),
        };

        return {
            transaction: [signedTransaction.toHex(), outTx.toHex()],
            contractAddress: finalTransaction.contractAddress,
            p2trAddress: finalTransaction.p2trAddress,
            utxos: [refundUTXO],
        };
    }

    /**
     * Basically it's fun to manage UTXOs.
     * @param {IWrapParameters} wrapParameters - The wrap parameters
     * @returns {Promise<WrapResult>} - The signed transaction
     * @throws {Error} - If the transaction could not be signed
     */
    public async wrap(wrapParameters: Omit<IWrapParameters, 'calldata'>): Promise<WrapResult> {
        if (wrapParameters.amount < currentConsensusConfig.VAULT_MINIMUM_AMOUNT) {
            throw new Error(
                `Amount is too low. Minimum consolidation is ${currentConsensusConfig.VAULT_MINIMUM_AMOUNT} sat. Received ${wrapParameters.amount} sat. Make sure that you cover the unwrap consolidation fees of ${currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT}sat.`,
            );
        }

        const childTransactionRequiredValue: bigint =
            wrapParameters.amount +
            currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT +
            (wrapParameters.priorityFee || 300n);

        const wbtc: wBTC = new wBTC(wrapParameters.network, wrapParameters.chainId);
        const to = wbtc.getAddress();
        const fundingParameters: IFundingTransactionParameters = {
            ...wrapParameters,
            amount: childTransactionRequiredValue,
            to: wrapParameters.to ?? to,
        };

        const preFundingTransaction = await this.createFundTransaction(fundingParameters);
        wrapParameters.utxos = this.getUTXOAsTransaction(preFundingTransaction.tx, to, 0);

        const preTransaction: WrapTransaction = new WrapTransaction(wrapParameters);

        // Initial generation
        await preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        // We add the amount
        parameters.amount += childTransactionRequiredValue;
        parameters.utxos = fundingParameters.utxos;

        const signedTransaction = await this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const newParams: IWrapParameters = {
            ...wrapParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
        };

        const finalTransaction: WrapTransaction = new WrapTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = await finalTransaction.signTransaction();
        return {
            transaction: [signedTransaction.tx.toHex(), outTx.toHex()],
            vaultAddress: finalTransaction.vault,
            amount: finalTransaction.amount,
            receiverAddress: finalTransaction.receiver,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, wrapParameters.from, 1),
        };
    }

    /**
     * Unwrap bitcoin.
     * @param {IUnwrapParameters} unwrapParameters - The unwrap parameters
     * @returns {Promise<UnwrapResult>} - The signed transaction
     * @throws {Error} - If the transaction could not be signed
     * @deprecated
     */
    public async unwrapSegwit(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult> {
        console.error('The "unwrap" method is deprecated. Use unwrapTap instead.');

        const transaction: UnwrapSegwitTransaction = new UnwrapSegwitTransaction(unwrapParameters);
        await transaction.signTransaction();

        const to = transaction.toAddress();
        if (!to) throw new Error('To address is required');

        // Initial generation
        const estimatedGas = await transaction.estimateTransactionFees();
        const estimatedFees = transaction.preEstimateTransactionFees(
            BigInt(unwrapParameters.feeRate),
            this.calculateNumInputs(unwrapParameters.unwrapUTXOs),
            2n,
            this.calculateNumSignatures(unwrapParameters.unwrapUTXOs),
            this.maxPubKeySize(unwrapParameters.unwrapUTXOs),
        );

        const fundingParameters: IFundingTransactionParameters = {
            ...unwrapParameters,
            amount: estimatedGas + estimatedFees,
            to: to,
        };

        const preFundingTransaction = await this.createFundTransaction(fundingParameters);
        unwrapParameters.utxos = this.getUTXOAsTransaction(preFundingTransaction.tx, to, 0);

        const preTransaction: UnwrapSegwitTransaction = new UnwrapSegwitTransaction({
            ...unwrapParameters,
            randomBytes: transaction.getRndBytes(),
        });

        // Initial generation
        await preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        parameters.utxos = fundingParameters.utxos;
        parameters.amount = (await preTransaction.estimateTransactionFees()) + estimatedFees;

        const signedTransaction = await this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const newParams: IUnwrapParameters = {
            ...unwrapParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
        };

        const finalTransaction: UnwrapSegwitTransaction = new UnwrapSegwitTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Psbt = await finalTransaction.signPSBT();
        const asBase64 = outTx.toBase64();
        const psbt = this.writePSBTHeader(PSBTTypes.UNWRAP, asBase64);

        return {
            fundingTransaction: signedTransaction.tx.toHex(),
            psbt: psbt,
            feeRefundOrLoss: estimatedFees,
            utxos: [],
        };
    }

    /**
     * Unwrap bitcoin via taproot.
     * @param {IUnwrapParameters} unwrapParameters - The unwrap parameters
     * @returns {Promise<UnwrapResult>} - The signed transaction
     * @throws {Error} - If the transaction could not be signed
     */
    public async unwrap(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult> {
        if (!unwrapParameters.from) {
            throw new Error('Field "from" not provided.');
        }

        const transaction: UnwrapTransaction = new UnwrapTransaction(unwrapParameters);
        await transaction.signTransaction();

        const to = transaction.toAddress();
        if (!to) throw new Error('To address is required');

        // Initial generation
        const estimatedGas = await transaction.estimateTransactionFees();
        const fundingParameters: IFundingTransactionParameters = {
            ...unwrapParameters,
            amount: estimatedGas,
            to: to,
        };

        const preFundingTransaction = await this.createFundTransaction(fundingParameters);
        unwrapParameters.utxos = this.getUTXOAsTransaction(preFundingTransaction.tx, to, 0);

        const preTransaction: UnwrapTransaction = new UnwrapTransaction({
            ...unwrapParameters,
            randomBytes: transaction.getRndBytes(),
        });

        // Initial generation
        await preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        parameters.utxos = fundingParameters.utxos;
        parameters.amount = await preTransaction.estimateTransactionFees();

        const signedTransaction = await this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const newParams: IUnwrapParameters = {
            ...unwrapParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
        };

        const finalTransaction: UnwrapTransaction = new UnwrapTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Psbt = await finalTransaction.signPSBT();
        const asBase64 = outTx.toBase64();
        const psbt = this.writePSBTHeader(PSBTTypes.UNWRAP, asBase64);

        return {
            fundingTransaction: signedTransaction.tx.toHex(),
            psbt: psbt,
            feeRefundOrLoss: finalTransaction.getFeeLossOrRefund(),
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, unwrapParameters.from, 1),
        };
    }

    /**
     * @description Creates a funding transaction.
     * @param {IFundingTransactionParameters} parameters - The funding transaction parameters
     * @returns {Promise<{ estimatedFees: bigint; tx: string }>} - The signed transaction
     */
    public async createBTCTransfer(
        parameters: IFundingTransactionParameters,
    ): Promise<BitcoinTransferResponse> {
        if (!parameters.from) {
            throw new Error('Field "from" not provided.');
        }

        const resp = await this.createFundTransaction(parameters);

        return {
            estimatedFees: resp.estimatedFees,
            original: resp.original,
            tx: resp.tx.toHex(),
            nextUTXOs: this.getAllNewUTXOs(resp.original, resp.tx, parameters.from),
        };
    }

    /**
     * Get all new UTXOs of a generated transaction.
     * @param {TransactionBuilder<TransactionType>} original - The original transaction
     * @param {Transaction} tx - The transaction
     * @param {Address} to - The address to filter
     */
    public getAllNewUTXOs(
        original: TransactionBuilder<TransactionType>,
        tx: Transaction,
        to: Address,
    ): UTXO[] {
        const outputs = original.getOutputs();

        const utxos: UTXO[] = [];
        for (let i = 0; i < tx.outs.length; i++) {
            const output = outputs[i];
            if ('address' in output) {
                if (output.address !== to) continue;
            } else {
                continue;
            }

            utxos.push(...this.getUTXOAsTransaction(tx, to, i));
        }

        return utxos;
    }

    private async createFundTransaction(
        parameters: IFundingTransactionParameters,
    ): Promise<FundingTransactionResponse> {
        if (!parameters.to) throw new Error('Field "to" not provided.');

        const fundingTransaction: FundingTransaction = new FundingTransaction(parameters);
        const signedTransaction: Transaction = await fundingTransaction.signTransaction();
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        return {
            tx: signedTransaction,
            original: fundingTransaction,
            estimatedFees: fundingTransaction.estimatedFees,
            nextUTXOs: this.getUTXOAsTransaction(signedTransaction, parameters.to, 0),
        };
    }

    private calculateNumSignatures(vault: VaultUTXOs[]): bigint {
        let numSignatures = 0n;

        for (const v of vault) {
            numSignatures += BigInt(v.minimum * v.utxos.length);
        }

        return numSignatures;
    }

    private calculateNumInputs(vault: VaultUTXOs[]): bigint {
        let numSignatures = 0n;

        for (const v of vault) {
            numSignatures += BigInt(v.utxos.length);
        }

        return numSignatures;
    }

    private maxPubKeySize(vault: VaultUTXOs[]): bigint {
        let size = 0;

        for (const v of vault) {
            size = Math.max(size, v.publicKeys.length);
        }

        return BigInt(size);
    }

    private writePSBTHeader(type: PSBTTypes, psbt: string): string {
        const buf = Buffer.from(psbt, 'base64');

        const header = Buffer.alloc(2);
        header.writeUInt8(type, 0);
        header.writeUInt8(currentConsensus, 1);

        return Buffer.concat([header, buf]).toString('hex');
    }

    private getUTXOAsTransaction(tx: Transaction, to: Address, index: number): UTXO[] {
        if (!tx.outs[index]) return [];

        const out: Output = tx.outs[index];
        const newUtxo: UTXO = {
            transactionId: tx.getId(),
            outputIndex: index,
            scriptPubKey: {
                hex: out.script.toString('hex'),
                address: to,
            },
            value: BigInt(out.value),
        };

        return [newUtxo];
    }
}
