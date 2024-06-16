# Unwrapping wBTC Guide

This guide will walk you through the process of unwrapping wBTC (Wrapped Bitcoin) using the OPNet protocol. Unwrapping
wBTC converts it back into regular Bitcoin, enabling you to use it directly on the Bitcoin network.

## What is Unwrapping?

Unwrapping wBTC involves converting your wrapped tokens back into Bitcoin. This process ensures that the wBTC you hold
is exchanged for an equivalent amount of Bitcoin, maintaining a 1:1 ratio. This allows you to move seamlessly between
using Bitcoin in decentralized applications and holding it in its original form.

## Preview

You can check your wBTC balance at any time via [wbtc.opnet.org](https://wbtc.opnet.org).

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
import { IUnwrapParameters } from '../transaction/interfaces/ITransactionParameters.js';
import { FetchUTXOParams, UTXO } from '../utxo/interfaces/IUTXO.js';
import { UnwrapTransaction } from '../transaction/UnwrapTransaction.js';
```

### Setting Up Configurations

We must provide the necessary configurations for the network and wallet:

- The opnetNode variable is the URL of the OPNet node.
- The Testnet variable contains the wallet address, public key, and private key.

```typescript
const network: Network = networks.testnet;
const opnetNode: string = 'https://testnet.opnet.org';
```

### 2. Load Wallet

```typescript
const wallet: Wallet = new Wallet(Testnet.wallet, network);
```

### 3. Connect to OPNet

```typescript
const opnet: OPNetLimitedProvider = new OPNetLimitedProvider(opnetNode);
const factory: TransactionFactory = new TransactionFactory();
```

### 4. Initialize RPC with Testnet Configuration

```typescript
await rpc.init(Testnet.config);
```

### 5. Define Unwrap Amount and Fetch UTXOs

We must define the amount to unwrap and fetch the UTXOs required for the transaction. Each OPNet vaults have UTXOs. We
need to fetch these UTXOs to unwrap the wBTC. We request an opnet node for the most optimized UTXOs to unwrap the wBTC.
If the UTXOs used to unwrap the wBTC do not follow the OPNet consensus rules, the unwrapping request will be denied.

```typescript
const unwrapAmount: bigint = UnwrapTransaction.MINIMUM_CONSOLIDATION_AMOUNT; // Minimum amount to unwrap
const unwrapUtxos = await opnet.fetchUnWrapParameters(unwrapAmount, wallet.p2tr);
if (!unwrapUtxos) {
    throw new Error('No vault UTXOs or something went wrong. Please try again.');
}

const utxoSetting: FetchUTXOParams = {
    address: wallet.p2wpkh,
    minAmount: 10000n,
    requestedAmount: unwrapAmount,
};

const utxos: UTXO[] = await opnet.fetchUTXO(utxoSetting);
if (!utxos) {
    throw new Error('No UTXOs found');
}
```

### 6. Create Unwrap Parameters and Finalize Transaction

Now, we will create the unwrap parameters and finalize the transaction using the TransactionFactory.

```typescript
const unwrapParameters: IUnwrapParameters = {
    from: wallet.p2tr, // Address to unwrap
    utxos: utxos, // User UTXOs to spend
    unwrapUTXOs: unwrapUtxos.vaultUTXOs, // Vault UTXOs to unwrap
    signer: wallet.keypair, // Signer
    network: network, // Bitcoin network
    feeRate: 100, // Fee rate in satoshis per byte (bitcoin fee)
    priorityFee: 10000n, // OPNet priority fee (incl gas.)
    amount: unwrapAmount, // Amount to unwrap
};

try {
    const finalTx = await factory.unwrap(unwrapParameters);
    console.log(`Due to bitcoin fees, you will lose ${finalTx.unwrapFeeLoss} satoshis by unwrapping. Do you want to proceed?`);
    console.log(`Final transaction:`, finalTx);
} catch (e) {
    console.error(`Something went wrong:`, e);
}
```

### 7. Broadcast the Transactions

To broadcast the transactions, we will send the raw transactions to the network.

```typescript
try {
    // If this transaction is missing, opnet will deny the unwrapping request.
    const fundingTransaction = await opnet.broadcastTransaction(finalTx.fundingTransaction, false);
    console.log(`Broadcasted:`, fundingTransaction);

    // This transaction is partially signed. You can not submit it to the Bitcoin network. It must pass via the OPNet network.
    const unwrapTransaction = await opnet.broadcastTransaction(finalTx.psbt, true);
    console.log(`Broadcasted:`, unwrapTransaction);
} catch (e) {
    console.error(`Error:`, e);
}
```

### 8. Mining a Block (Optional, for Regtest)

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

## Conclusion

You have now successfully unwrapped wBTC into Bitcoin using OPNet!
