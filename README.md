# OP_NET - Transaction Builder

![Bitcoin](https://img.shields.io/badge/Bitcoin-000?style=for-the-badge&logo=bitcoin&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node%20js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![NPM](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)
![Gulp](https://img.shields.io/badge/GULP-%23CF4647.svg?style=for-the-badge&logo=gulp&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B3263?style=for-the-badge&logo=eslint&logoColor=white)

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

## Introduction

The OP_NET Transaction Builder library allows you to create and sign transactions for the OP_NET network. Written in
TypeScript, this library provides a comprehensive set of functions to facilitate the creation, reading, and manipulation
of OP_NET transactions, smart contracts, and other OP_NET-related technologies.

## Getting Started

### Prerequisites

- Node.js version 16.x or higher
- npm (Node Package Manager)

### Installation

```shell
npm i @btc-vision/transaction
```

### Documentation

Documentation is available at [https://transaction.opnet.org](https://transaction.opnet.org) or in the `docs/` directory
of the repository.

#### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/btc-vision/transaction.git
   ```
2. Navigate to the repository directory:
   ```bash
   cd transaction
   ```
3. Install the required dependencies:
   ```bash
   npm i
   ```

## Deployments and Wrapping

To learn how to wrap and unwrap Bitcoin on OP_NET, please refer to
the [Wrap.md](https://github.com/btc-vision/transaction/blob/main/Wrap.md) guide.
To learn how to deploy smart contracts on OP_NET, please refer to
the [Deploy.md](https://github.com/btc-vision/transaction/blob/main/Deploy.md) guide.

## Usage

Here's a basic example of how to use the OP_NET Transaction Builder library to create and sign a transaction:
The following example demonstrates how to create a wBTC transfer transaction.

### Import Statements

This section imports the necessary modules and libraries required for building and broadcasting transactions.

```typescript
import {
    TransactionFactory,
    IInteractionParameters,
    FetchUTXOParams,
    UTXO,
    UTXOManager,
    Wallet,
    wBTC
} from '@btc-vision/transaction';
import { networks } from 'bitcoinjs-lib';
import { BitcoinRPC } from '@btc-vision/bsi-bitcoin-rpc';
import { ABICoder, BinaryWriter } from '@btc-vision/bsi-binary';
import { BitcoinNetwork } from '@btc-vision/bsi-common';
```

### Setting Up configurations

We must provide the necessary configurations for the network, wallet, and RPC connection:

- The opnetNode variable is the URL of the OP_NET node.
- The Testnet variable contains the wallet address, public key, and private key.
- The config variable inside the testnet object contains the network, host, port, username, and password for the RPC
  connection.

```typescript
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

### Setting Up the Network and RPC

This section sets up the network, RPC, and wallet instances required for the transaction.

```typescript
// Set up the network, RPC, and wallet
const network: networks.Network = networks.testnet; // Network
const rpc: BitcoinRPC = new BitcoinRPC();
const wBtc: wBTC = new wBTC(network); // wBTC metadata

const wallet: Wallet = new Wallet(Regtest.wallet, network); // Wallet
const utxoManager: UTXOManager = new UTXOManager(opnetNode); // UTXO manager

const factory: TransactionFactory = new TransactionFactory(); // Transaction factory
const abiCoder: ABICoder = new ABICoder();
const transferSelector = Number(`0x` + abiCoder.encodeSelector('transfer')); // Selector for the transfer function
```

### Creating Transfer Calldata

This section demonstrates how to create the calldata required for the `transfer` function.

```typescript
// Function to create the transfer calldata
function getTransferToCalldata(to: string, amount: bigint): Buffer {
    const addCalldata: BinaryWriter = new BinaryWriter();
    addCalldata.writeSelector(transferSelector);
    addCalldata.writeAddress(to);
    addCalldata.writeU256(amount);
    return Buffer.from(addCalldata.getBuffer());
}
```

### Initializing and Fetching UTXOs

This section initializes the RPC connection and fetches UTXOs for the wallet.

```typescript

await rpc.init(Testnet.config); // Initialize the RPC connection

// Fetch UTXOs for the wallet
const utxoSetting: FetchUTXOParams = {
    address: wallet.p2wpkh,
    minAmount: 10000n,
    requestedAmount: 100000n,
};

const utxos: UTXO[] = await utxoManager.fetchUTXO(utxoSetting);
console.log(`UTXOs:`, utxos);

if (!utxos.length) {
    throw new Error('No UTXOs found');
}
```

### Preparing and Signing the Transaction

This section prepares the interaction parameters and signs the transaction.

```typescript
// Prepare the interaction parameters for the transaction
const amountToSend: bigint = 5000000n; // Amount to send
const calldata: Buffer = getTransferToCalldata(wBtc.getAddress(), amountToSend);
const interactionParameters: IInteractionParameters = {
    from: wallet.p2wpkh, // From address
    to: wBtc.getAddress(), // To address
    utxos: utxos, // UTXOs
    signer: wallet.keypair, // Signer
    network: network, // Network
    feeRate: 150, // Fee rate (satoshi per byte)
    priorityFee: 50000n, // Priority fee (opnet)
    calldata: calldata, // Calldata
};

// Sign and broadcast the transaction
const finalTx = factory.signInteraction(interactionParameters);
```

### Broadcasting the Transaction

This section broadcasts the signed transaction to the network.

```typescript
const firstTxBroadcast = await rpc.sendRawTransaction({ hexstring: finalTx[0] });
console.log(`First transaction broadcasted: ${firstTxBroadcast}`);

if (!firstTxBroadcast) {
    throw new Error('Could not broadcast first transaction');
}

const secondTxBroadcast = await rpc.sendRawTransaction({ hexstring: finalTx[1] });
console.log(`Second transaction broadcasted: ${secondTxBroadcast}`);

if (!secondTxBroadcast) {
    throw new Error('Could not broadcast second transaction');
}
```

That's it! You have successfully created and broadcasted a transaction using OP_NET.

## Contribution

Contributions are welcome! Please read through the `CONTRIBUTING.md` file for guidelines on how to submit issues,
feature requests, and pull requests. We appreciate your input and encourage you to help us improve OP_NET.

## License

This project is open source and available under the [MIT License](LICENSE). If you have any suggestions or
contributions, please feel free to submit a pull request.
