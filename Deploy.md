# Deploying a Smart Contract on OPNet

This guide will walk you through the process of deploying a smart contract on the OPNet protocol. OPNet allows for the
execution of smart contracts on the Bitcoin network, leveraging the security and stability of Bitcoin.

## Prerequisites

- Node.js and npm installed
- Bitcoin regtest wallet
- Access to an OPNet node
- Bitcoin RPC configured for regtest
- Contract bytecode in WebAssembly format

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
import { IDeploymentParameters } from '../transaction/interfaces/ITransactionParameters.js';
import { FetchUTXOParams, UTXO } from '../utxo/interfaces/IUTXO.js';
import * as fs from 'fs';
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
const utxoManager: OPNetLimitedProvider = new OPNetLimitedProvider(opnetNode);
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

### 6. Define UTXO Settings and Fetch UTXOs

```typescript
const utxoSetting: FetchUTXOParams = {
    address: wallet.p2wpkh,
    minAmount: 10000n,
    requestedAmount: 100000n,
};

const utxos: UTXO[] = await utxoManager.fetchUTXO(utxoSetting);
if (!utxos) {
    throw new Error('No UTXOs found');
}
```

### 7. Read Contract Bytecode

```typescript
const bytecode = fs.readFileSync('./bytecode/contract.wasm');
```

### 8. Create Deployment Parameters and Finalize Transaction

Let's create the deployment parameters and finalize the transaction:

```typescript
const deploymentParameters: IDeploymentParameters = {
    from: wallet.p2wpkh,
    utxos: utxos,
    signer: wallet.keypair,
    network: network,
    feeRate: 150,
    priorityFee: 50000n,
    bytecode: bytecode,
};

const finalTx = factory.signDeployment(deploymentParameters);
console.log(`Final transaction:`, finalTx);
```

### 9. Broadcast the Transactions

Broadcast the transactions to the network:

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

### 10. (Optional) Mine a Block

If you need to mine a block after broadcasting the transactions:

```typescript
if (shouldMineBlock) {
    await mineBlock();
}
```

## Conclusion

You have now successfully deployed a smart contract on the OPNet protocol. This contract can interact with the Bitcoin
network, enabling complex functionalities and decentralized applications.

For any further questions or issues, please refer to the official documentation or reach out to the community for
support.
