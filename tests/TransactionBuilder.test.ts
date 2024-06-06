import 'jest';
import { Wallet } from '../src/keypair/Wallet.js';
import { Regtest } from '../src/scripts/Regtest.js';
import { Logger } from '@btc-vision/logger';
import { wBTC } from '../src/metadata/contracts/wBTC.js';
import { networks } from 'bitcoinjs-lib';
import { UTXOManager } from '../src/utxo/UTXOManager.js';
import { FetchUTXOParams, UTXO } from '../src/utxo/interfaces/IUTXO.js';
import { IInteractionParameters } from '../src/transaction/interfaces/ITransactionParameters.js';
import { InteractionTransaction } from '../src/transaction/builders/InteractionTransaction.js';

const logger: Logger = new Logger();
const network: networks.Network = networks.regtest;

describe('Transaction Builder', () => {
    const wBtc: wBTC = new wBTC(network);

    const wallet: Wallet = new Wallet(Regtest.wallet, network);
    logger.log(`Loaded wallet: ${wallet.p2tr} - ${wallet.p2wpkh}`);

    const utxoManager: UTXOManager = new UTXOManager('http://localhost:9001');

    /** @test {TransactionBuilder#build} */
    test('should be able to build a transaction', async () => {
        const utxoSetting: FetchUTXOParams = {
            address: wallet.p2wpkh,
            minAmount: 10000n,
            requestedAmount: 100000n,
        };

        const utxos: UTXO[] = await utxoManager.fetchUTXO(utxoSetting);
        console.log(`UTXOs:`, utxos);

        if (!utxos) {
            throw new Error('No UTXOs found');
        }

        logger.log(`UTXOs fetched. Count: ${utxos.length}`);

        const interactionParameters: IInteractionParameters = {
            from: wallet.p2wpkh,
            to: wBtc.getAddress(),
            utxos: utxos,
            signer: wallet.keypair,
            network: network,
            feeRate: 150,
            priorityFee: 500n,
            calldata: Buffer.from('test'),
        };

        const interactionTransaction: InteractionTransaction = new InteractionTransaction(
            interactionParameters,
        );

        console.log(`Transaction:`, interactionTransaction);
    });
});
