import { Transaction } from 'bitcoinjs-lib';
import {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
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

export interface DeploymentResult {
    readonly transaction: [string, string];

    readonly contractAddress: Address;
    readonly p2trAddress: Address;
}

export interface WrapResult {
    readonly transaction: [string, string];
    readonly vaultAddress: Address;
    readonly amount: bigint;
    readonly receiverAddress: Address;
}

export class TransactionFactory {
    /**
     * @description Generates the required transactions.
     * @returns {[Transaction, Transaction]} - The signed transaction
     */
    public signInteraction(interactionParameters: IInteractionParameters): [string, string] {
        if (!interactionParameters.to) {
            throw new Error('Field "to" not provided.');
        }

        const transaction: InteractionTransaction = new InteractionTransaction(
            interactionParameters,
        );

        transaction.signTransaction();

        // Initial generation
        const estimatedGas = transaction.estimateTransactionFees();
        const fundingParameters: IFundingTransactionParameters = {
            ...interactionParameters,
            childTransactionRequiredValue: estimatedGas,
        };

        const preFundingTransaction: Transaction = this.createFundTransaction(fundingParameters);
        interactionParameters.utxos = this.getUTXOAsTransaction(
            preFundingTransaction,
            interactionParameters.to,
            0,
        );

        const preTransaction: InteractionTransaction = new InteractionTransaction(
            interactionParameters,
        );

        // Initial generation
        preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            preTransaction.getFundingTransactionParameters();

        parameters.utxos = fundingParameters.utxos;
        parameters.childTransactionRequiredValue = preTransaction.estimateTransactionFees();

        const signedTransaction: Transaction = this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const newParams: IInteractionParameters = {
            ...interactionParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction, interactionParameters.to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
        };

        const finalTransaction: InteractionTransaction = new InteractionTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = finalTransaction.signTransaction();

        return [signedTransaction.toHex(), outTx.toHex()];
    }

    /**
     * @description Generates the required transactions.
     * @param {IDeploymentParameters} deploymentParameters - The deployment parameters
     * @returns {DeploymentResult} - The signed transaction
     */
    public signDeployment(deploymentParameters: IDeploymentParameters): DeploymentResult {
        const preTransaction: DeploymentTransaction = new DeploymentTransaction(
            deploymentParameters,
        );

        // Initial generation
        preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            preTransaction.getFundingTransactionParameters();

        const fundingTransaction: FundingTransaction = new FundingTransaction(parameters);
        const signedTransaction: Transaction = fundingTransaction.signTransaction();
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
        };

        const finalTransaction: DeploymentTransaction = new DeploymentTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = finalTransaction.signTransaction();

        return {
            transaction: [signedTransaction.toHex(), outTx.toHex()],
            contractAddress: finalTransaction.contractAddress,
            p2trAddress: finalTransaction.p2trAddress,
        };
    }

    /**
     * Basically it's fun to manage UTXOs.
     * @param {IWrapParameters} warpParameters - The wrap parameters
     * @returns {WrapResult | undefined} - The signed transaction
     * @throws {Error} - If the transaction could not be signed
     */
    public wrap(warpParameters: IWrapParameters): WrapResult {
        const wbtc: wBTC = new wBTC(warpParameters.network);

        const to = wbtc.getAddress();
        const fundingParameters: IFundingTransactionParameters = {
            ...warpParameters,
            childTransactionRequiredValue: warpParameters.amount,
            to: to,
        };

        const preFundingTransaction: Transaction = this.createFundTransaction(fundingParameters);
        warpParameters.utxos = this.getUTXOAsTransaction(preFundingTransaction, to, 0);

        const preTransaction: WrapTransaction = new WrapTransaction(warpParameters);

        // Initial generation
        preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            preTransaction.getFundingTransactionParameters();

        // We add the amount
        parameters.childTransactionRequiredValue += warpParameters.amount;
        parameters.utxos = fundingParameters.utxos;

        const signedTransaction: Transaction = this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const newParams: IWrapParameters = {
            ...warpParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction, to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
        };

        const finalTransaction: WrapTransaction = new WrapTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = finalTransaction.signTransaction();

        return {
            transaction: [signedTransaction.toHex(), outTx.toHex()],
            vaultAddress: finalTransaction.vault,
            amount: finalTransaction.amount,
            receiverAddress: finalTransaction.receiver,
        };
    }

    private getUTXOAsTransaction(tx: Transaction, to: Address, index: number): UTXO[] {
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

    private createFundTransaction(parameters: IFundingTransactionParameters): Transaction {
        const fundingTransaction: FundingTransaction = new FundingTransaction(parameters);
        const signedTransaction: Transaction = fundingTransaction.signTransaction();
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        return signedTransaction;
    }
}
