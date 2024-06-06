import { Transaction } from 'bitcoinjs-lib';
import {
    IFundingTransactionParameters,
    IInteractionParameters,
} from './interfaces/ITransactionParameters.js';
import { FundingTransaction } from './builders/FundingTransaction.js';
import { Output } from 'bitcoinjs-lib/src/transaction.js';
import { UTXO } from '../utxo/interfaces/IUTXO.js';
import { InteractionTransaction } from './builders/InteractionTransaction.js';

export class TransactionFactory {
    /**
     * @description Generates the required transactions.
     * @returns {[Transaction, Transaction]} - The signed transaction
     */
    public signInteraction(interactionParameters: IInteractionParameters): [string, string] {
        const preTransaction: InteractionTransaction = new InteractionTransaction(
            interactionParameters,
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
            outputIndex: 0,
            scriptPubKey: {
                hex: out.script.toString('hex'),
                address: preTransaction.getScriptAddress(),
            },
            value: BigInt(out.value),
        };

        const newParams: IInteractionParameters = {
            ...interactionParameters,
            utxos: [newUtxo],
            randomBytes: preTransaction.getRndBytes(),
        };

        const finalTransaction: InteractionTransaction = new InteractionTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = finalTransaction.signTransaction();

        return [signedTransaction.toHex(), outTx.toHex()];
    }
}
