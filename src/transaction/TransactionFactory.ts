import { Transaction } from '@btc-vision/bitcoin';
import { Output } from '@btc-vision/bitcoin/src/transaction.js';
import { currentConsensus } from '../consensus/ConsensusConfig.js';
import { UTXO } from '../utxo/interfaces/IUTXO.js';
import {
    CustomScriptTransaction,
    ICustomTransactionParameters,
} from './builders/CustomScriptTransaction.js';
import { DeploymentTransaction } from './builders/DeploymentTransaction.js';
import { FundingTransaction } from './builders/FundingTransaction.js';
import { InteractionTransaction } from './builders/InteractionTransaction.js';
import { TransactionBuilder } from './builders/TransactionBuilder.js';
import { TransactionType } from './enums/TransactionType.js';
import {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
} from './interfaces/ITransactionParameters.js';
import { PSBTTypes } from './psbt/PSBTTypes.js';

export interface DeploymentResult {
    readonly transaction: [string, string];

    readonly contractAddress: string;
    readonly contractPubKey: string;
    readonly p2trAddress: string;

    readonly utxos: UTXO[];
}

export interface WrapResult {
    readonly transaction: [string, string];
    readonly vaultAddress: string;
    readonly amount: bigint;
    readonly receiverAddress: string;
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

export class TransactionFactory {
    /**
     * @description Generate a transaction with a custom script.
     * @returns {Promise<[string, string]>} - The signed transaction
     */
    public async createCustomScriptTransaction(
        interactionParameters: ICustomTransactionParameters,
    ): Promise<[string, string, UTXO[]]> {
        if (!interactionParameters.to) {
            throw new Error('Field "to" not provided.');
        }

        if (!interactionParameters.from) {
            throw new Error('Field "from" not provided.');
        }

        const preTransaction: CustomScriptTransaction = new CustomScriptTransaction({
            ...interactionParameters,
            utxos: [interactionParameters.utxos[0]], // we simulate one input here.
        });

        // we don't sign that transaction, we just need the parameters.

        await preTransaction.generateTransactionMinimalSignatures();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        parameters.utxos = interactionParameters.utxos;
        parameters.amount =
            (await preTransaction.estimateTransactionFees()) +
            this.getPriorityFee(interactionParameters) +
            preTransaction.getOptionalOutputValue();

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

        const newParams: ICustomTransactionParameters = {
            ...interactionParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
            estimatedFees: preTransaction.estimatedFees,
        };

        const finalTransaction: CustomScriptTransaction = new CustomScriptTransaction(newParams);

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

        if (!interactionParameters.utxos[0]) {
            throw new Error('Missing at least one UTXO.');
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
        parameters.amount =
            (await preTransaction.estimateTransactionFees()) +
            this.getPriorityFee(interactionParameters) +
            preTransaction.getOptionalOutputValue();

        const feeEstimationFundingTransaction = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
        });
        if (!feeEstimationFundingTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        parameters.estimatedFees = feeEstimationFundingTransaction.estimatedFees;

        const signedTransaction = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
        });
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

        parameters.amount =
            (await preTransaction.estimateTransactionFees()) +
            this.getPriorityFee(deploymentParameters) +
            preTransaction.getOptionalOutputValue();

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
            optionalOutputs: [],
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
            contractAddress: finalTransaction.contractAddress.p2tr(deploymentParameters.network),
            contractPubKey: finalTransaction.contractPubKey,
            p2trAddress: finalTransaction.p2trAddress,
            utxos: [refundUTXO],
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
     * @param {string} to - The address to filter
     */
    public getAllNewUTXOs(
        original: TransactionBuilder<TransactionType>,
        tx: Transaction,
        to: string,
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

    private writePSBTHeader(type: PSBTTypes, psbt: string): string {
        const buf = Buffer.from(psbt, 'base64');

        const header = Buffer.alloc(2);
        header.writeUInt8(type, 0);
        header.writeUInt8(currentConsensus, 1);

        return Buffer.concat([header, buf]).toString('hex');
    }

    private getPriorityFee(params: ITransactionParameters): bigint {
        if (params.priorityFee < TransactionBuilder.MINIMUM_DUST) {
            return TransactionBuilder.MINIMUM_DUST;
        }

        return params.priorityFee;
    }

    private getUTXOAsTransaction(tx: Transaction, to: string, index: number): UTXO[] {
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
