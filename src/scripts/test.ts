import { wBTC } from '../metadata/contracts/wBTC.js';
import { Wallet } from '../keypair/Wallet.js';
import { Regtest } from './Regtest.js';
import { UTXOManager } from '../utxo/UTXOManager.js';
import { FetchUTXOParams, UTXO } from '../utxo/interfaces/IUTXO.js';
import { IInteractionParameters } from '../transaction/interfaces/ITransactionParameters.js';
import { networks } from 'bitcoinjs-lib';
import { TransactionFactory } from '../transaction/TransactionFactory.js';
import { BitcoinRPC } from '@btc-vision/bsi-bitcoin-rpc';

const network: networks.Network = networks.regtest;
const rpc: BitcoinRPC = new BitcoinRPC();
const wBtc: wBTC = new wBTC(network);
const wallet: Wallet = new Wallet(Regtest.wallet, network);

const utxoManager: UTXOManager = new UTXOManager('http://localhost:9001');
const factory: TransactionFactory = new TransactionFactory();

const mineBlock: boolean = true;

(async () => {
    await rpc.init(Regtest.config);

    if (mineBlock) {
        // lets mine 1 block.
        const ok = await rpc.generateToAddress(1, wallet.p2wpkh, 'default');
        if (!ok) {
            throw new Error('Could not mine block');
        }

        console.log(`Mined block`, ok);
    }

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
    const firstTxBroadcast = await rpc.sendRawTransaction({
        hexstring: finalTx[0],
    });

    console.log(`First transaction broadcasted: ${firstTxBroadcast}`);

    if (!firstTxBroadcast) {
        throw new Error('Could not broadcast first transaction');
    }

    const secondTxBroadcast = await rpc.sendRawTransaction({
        hexstring: finalTx[1],
    });

    console.log(`Second transaction broadcasted: ${secondTxBroadcast}`);

    if (!secondTxBroadcast) {
        throw new Error('Could not broadcast second transaction');
    }
})();
