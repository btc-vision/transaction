# Wrapping Bitcoin (wBTC) Guide

This guide will walk you through the process of wrapping Bitcoin (wBTC) using the OPNet protocol. Wrapping Bitcoin
allows you to use Bitcoin in smart contracts, similar to how ERC-20 tokens are used on Ethereum.

## What is wBTC?

wBTC (Wrapped Bitcoin) is an OP_0 token backed 1:1 with Bitcoin. It enables Bitcoin holders
to participate in decentralized finance (DeFi) applications, offering greater liquidity and integration within the
Bitcoin ecosystem. By wrapping Bitcoin, users can leverage their BTC in a broader range of financial services while
retaining the value and stability of Bitcoin.

## Preview

You can check your wBTC balance at anytime via [wbtc.opnet.org](https://wbtc.opnet.org).

## Prerequisites

- Node.js and npm installed
- Bitcoin testnet wallet
- Access to an OPNet node
- Bitcoin RPC configured for testnet

## Setup

First, ensure you have the necessary dependencies installed in your project:

```sh
npm i
```

## Step-by-Step Guide

### 1. Import Required Libraries

```typescript
import { Wallet } from '../keypair/Wallet.js';
import { OPNetLimitedProvider } from '../utxo/OPNetLimitedProvider.js';
import { networks, Network } from 'bitcoinjs-lib';
import { TransactionFactory } from '../transaction/TransactionFactory.js';
import { BitcoinRPC } from '@btc-vision/bsi-bitcoin-rpc';
import { IWrapParameters } from '../transaction/interfaces/ITransactionParameters.js';
import { FetchUTXOParams, UTXO } from '../utxo/interfaces/IUTXO.js';
```

### Setting Up configurations

We must provide the necessary configurations for the network, wallet, and RPC connection:

- The opnetNode variable is the URL of the OP_NET node.
- The Testnet variable contains the wallet address, public key, and private key.
- The config variable inside the testnet object contains the network, host, port, username, and password for the RPC
  connection.

```typescript
const network: Network = networks.testnet;
const opnetNode: string = 'https://testnet.opnet.org';
const Testnet: NetworkInformation = {
    wallet: {
        address: '', // as BECH32
        publicKey: '', // as HEX
        privateKey: '', // as WIF
    },

    config: {
        BITCOIND_NETWORK: BitcoinNetwork.TestNet, // Bitcoin network
        BITCOIND_HOST: '', // Bitcoin RPC host
        BITCOIND_PORT: 9242, // Bitcoin RPC port

        BITCOIND_USERNAME: '', // Bitcoin RPC username
        BITCOIND_PASSWORD: '', // Bitcoin RPC password
    },
};
```

### 2. Initialize Network and RPC

```typescript
const rpc: BitcoinRPC = new BitcoinRPC();
const wallet: Wallet = new Wallet(Testnet.wallet, network);
```

### 3. Connect to OPNet

```typescript
const opnet: OPNetLimitedProvider = new OPNetLimitedProvider(opnetNode);
const factory: TransactionFactory = new TransactionFactory();
```

### 4. Mining a Block (Optional)

If you are using a regtest or need to mine a block to proceed:

```typescript
const shouldMineBlock: boolean = true;

async function mineBlock(): Promise<boolean> {
    const ok = await rpc.generateToAddress(1, wallet.p2wpkh, 'default');
    if (!ok) {
        throw new Error('Could not mine block');
    }
    console.log(`Mined block`, ok);
    return !!ok.length;
}
```

### 5. Initialize RPC with Testnet Configuration

```typescript
await rpc.init(Testnet.config);
```

### 6. Define Wrap Amount and Fetch UTXOs

```typescript
const wrapAmount: bigint = 100000000n; // 1 BTC in satoshis
const utxoSetting: FetchUTXOParams = {
    address: wallet.p2wpkh,
    minAmount: 10000n,
    requestedAmount: wrapAmount,
};

const utxos: UTXO[] = await opnet.fetchUTXO(utxoSetting);
if (!utxos) {
    throw new Error('No UTXOs found');
}
```

### 7. Fetch Wrap Parameters

This will fetch the parameters required for wrapping Bitcoin into WBTC. If no parameters are found, an error will be
thrown.
This step is very important as it provides the necessary information for the wrapping process.

```typescript
const generationParameters = await opnet.fetchWrapParameters(wrapAmount);
if (!generationParameters) {
    throw new Error('No generation parameters found');
}
```

### 8. Create Wrap Parameters and Finalize Transaction

Now, we will create the wrap parameters and finalize the transaction using the TransactionFactory.

```typescript
const wrapParameters: IWrapParameters = {
    from: wallet.p2wpkh,
    utxos: utxos,
    signer: wallet.keypair,
    network: network,
    feeRate: 350,
    priorityFee: 50000n,
    amount: wrapAmount,
    generationParameters: generationParameters,
};

const finalTx = factory.wrap(wrapParameters);
console.log(`Final transaction:`, finalTx);
```

### 9. Broadcast the Transactions

To broadcast the transactions, we will send the raw transactions to the network.

```typescript
const firstTxBroadcast = await rpc.sendRawTransaction({
    hexstring: finalTx.transaction[0],
});

console.log(`First transaction broadcasted: ${firstTxBroadcast}`);

if (!firstTxBroadcast) {
    throw new Error('Could not broadcast first transaction');
}

const secondTxBroadcast = await rpc.sendRawTransaction({
    hexstring: finalTx.transaction[1],
});

console.log(`Second transaction broadcasted: ${secondTxBroadcast}`);

if (!secondTxBroadcast) {
    throw new Error('Could not broadcast second transaction');
}
```

## Conclusion

You have now successfully wrapped Bitcoin into WBTC using the OPNet protocol!
For any further questions or issues, please refer to the official documentation or reach out to the community for
support.
