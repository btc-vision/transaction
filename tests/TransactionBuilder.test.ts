import 'jest';
import { Regtest } from '../src/tests/Regtest.js';
import { Logger } from '@btc-vision/logger';
import { networks } from 'bitcoinjs-lib';
import {
    FetchUTXOParams,
    IInteractionParameters,
    OPNetLimitedProvider,
    TransactionFactory,
    UTXO,
    Wallet,
    wBTC,
} from '../src/index.js';

const logger: Logger = new Logger();
const network: networks.Network = networks.regtest;

describe('Transaction Builder', () => {
    const wBtc: wBTC = new wBTC(network);

    const wallet: Wallet = new Wallet(Regtest.wallet, network);
    logger.log(`Loaded wallet: ${wallet.p2tr} - ${wallet.p2wpkh}`);

    const utxoManager: OPNetLimitedProvider = new OPNetLimitedProvider('http://localhost:9001');
    const factory: TransactionFactory = new TransactionFactory();

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

        const finalTx = factory.signInteraction(interactionParameters);
        console.log(`Transaction:`, finalTx);
    });
});
