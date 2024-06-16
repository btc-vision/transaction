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

export interface UnwrapResult {
    readonly fundingTransaction: string;
    readonly psbt: string;
    readonly unwrapFeeLoss: bigint;
}

export class TransactionFactory {
    constructor() {}

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

        const preFundingTransaction = this.createFundTransaction(fundingParameters);
        interactionParameters.utxos = this.getUTXOAsTransaction(
            preFundingTransaction.tx,
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

        const signedTransaction = this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const newParams: IInteractionParameters = {
            ...interactionParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
        };

        const finalTransaction: InteractionTransaction = new InteractionTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = finalTransaction.signTransaction();

        return [signedTransaction.tx.toHex(), outTx.toHex()];
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
            nonWitnessUtxo: signedTransaction.toBuffer(),
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
        if (warpParameters.amount < UnwrapTransaction.MINIMUM_CONSOLIDATION_AMOUNT) {
            throw new Error(
                `Amount is too low. Minimum consolidation is ${UnwrapTransaction.MINIMUM_CONSOLIDATION_AMOUNT} sat. Received ${warpParameters.amount} sat.`,
            );
        }

        const wbtc: wBTC = new wBTC(warpParameters.network);

        const to = wbtc.getAddress();
        const fundingParameters: IFundingTransactionParameters = {
            ...warpParameters,
            childTransactionRequiredValue: warpParameters.amount,
            to: to,
        };

        const preFundingTransaction = this.createFundTransaction(fundingParameters);
        warpParameters.utxos = this.getUTXOAsTransaction(preFundingTransaction.tx, to, 0);

        const preTransaction: WrapTransaction = new WrapTransaction(warpParameters);

        // Initial generation
        preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            preTransaction.getFundingTransactionParameters();

        // We add the amount
        parameters.childTransactionRequiredValue += warpParameters.amount;
        parameters.utxos = fundingParameters.utxos;

        const signedTransaction = this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const newParams: IWrapParameters = {
            ...warpParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
        };

        const finalTransaction: WrapTransaction = new WrapTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = finalTransaction.signTransaction();

        return {
            transaction: [signedTransaction.tx.toHex(), outTx.toHex()],
            vaultAddress: finalTransaction.vault,
            amount: finalTransaction.amount,
            receiverAddress: finalTransaction.receiver,
        };
    }

    /**
     * Unwrap bitcoin.
     * @param {IUnwrapParameters} unwrapParameters - The unwrap parameters
     * @returns {UnwrapResult} - The signed transaction
     * @throws {Error} - If the transaction could not be signed
     * @deprecated
     */
    public async unwrapSegwit(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult> {
        console.error('The "unwrap" method is deprecated. Use unwrapTap instead.');

        const transaction: UnwrapSegwitTransaction = new UnwrapSegwitTransaction(unwrapParameters);
        transaction.signTransaction();

        const to = transaction.toAddress();
        if (!to) throw new Error('To address is required');

        // Initial generation
        const estimatedGas = transaction.estimateTransactionFees();
        const estimatedFees = transaction.preEstimateTransactionFees(
            BigInt(unwrapParameters.feeRate),
            this.calculateNumInputs(unwrapParameters.unwrapUTXOs),
            2n,
            this.calculateNumSignatures(unwrapParameters.unwrapUTXOs),
            this.maxPubKeySize(unwrapParameters.unwrapUTXOs),
        );

        const fundingParameters: IFundingTransactionParameters = {
            ...unwrapParameters,
            childTransactionRequiredValue: estimatedGas + estimatedFees,
            to: to,
        };

        const preFundingTransaction = this.createFundTransaction(fundingParameters);
        unwrapParameters.utxos = this.getUTXOAsTransaction(preFundingTransaction.tx, to, 0);

        const preTransaction: UnwrapSegwitTransaction = new UnwrapSegwitTransaction({
            ...unwrapParameters,
            randomBytes: transaction.getRndBytes(),
        });

        // Initial generation
        preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            preTransaction.getFundingTransactionParameters();

        parameters.utxos = fundingParameters.utxos;
        parameters.childTransactionRequiredValue =
            preTransaction.estimateTransactionFees() + estimatedFees;

        const signedTransaction = this.createFundTransaction(parameters);
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
        const outTx: Psbt = finalTransaction.signPSBT();
        const asBase64 = outTx.toBase64();
        const psbt = this.writePSBTHeader(PSBTTypes.UNWRAP, asBase64);

        return {
            fundingTransaction: signedTransaction.tx.toHex(),
            psbt: psbt,
            unwrapFeeLoss: estimatedFees,
        };
    }

    /**
     * Unwrap bitcoin via taproot.
     * @param {IUnwrapParameters} unwrapParameters - The unwrap parameters
     * @returns {UnwrapResult} - The signed transaction
     * @throws {Error} - If the transaction could not be signed
     */
    public async unwrap(unwrapParameters: IUnwrapParameters): Promise<UnwrapResult> {
        const transaction: UnwrapTransaction = new UnwrapTransaction(unwrapParameters);

        transaction.signTransaction();

        const to = transaction.toAddress();
        if (!to) throw new Error('To address is required');

        // Initial generation
        const estimatedGas = transaction.estimateTransactionFees();
        const fundingParameters: IFundingTransactionParameters = {
            ...unwrapParameters,
            childTransactionRequiredValue: estimatedGas,
            to: to,
        };

        const preFundingTransaction = this.createFundTransaction(fundingParameters);
        unwrapParameters.utxos = this.getUTXOAsTransaction(preFundingTransaction.tx, to, 0);

        const preTransaction: UnwrapTransaction = new UnwrapTransaction({
            ...unwrapParameters,
            randomBytes: transaction.getRndBytes(),
        });

        // Initial generation
        preTransaction.signTransaction();

        const parameters: IFundingTransactionParameters =
            preTransaction.getFundingTransactionParameters();

        parameters.utxos = fundingParameters.utxos;
        parameters.childTransactionRequiredValue = preTransaction.estimateTransactionFees();

        const signedTransaction = this.createFundTransaction(parameters);
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
        const outTx: Psbt = finalTransaction.signPSBT();
        const asBase64 = outTx.toBase64();
        const psbt = this.writePSBTHeader(PSBTTypes.UNWRAP, asBase64);

        return {
            fundingTransaction: signedTransaction.tx.toHex(),
            psbt: psbt,
            unwrapFeeLoss: finalTransaction.getFeeLoss(),
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

        const header = Buffer.alloc(1);
        header.writeUInt8(type, 0);

        return Buffer.concat([header, buf]).toString('hex');
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

    private createFundTransaction(parameters: IFundingTransactionParameters): {
        tx: Transaction;
        original: FundingTransaction;
    } {
        const fundingTransaction: FundingTransaction = new FundingTransaction(parameters);
        const signedTransaction: Transaction = fundingTransaction.signTransaction();
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        return {
            tx: signedTransaction,
            original: fundingTransaction,
        };
    }
}
