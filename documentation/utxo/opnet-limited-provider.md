# OPNetLimitedProvider

Fetch UTXOs and broadcast transactions through OPNet nodes.

## Overview

`OPNetLimitedProvider` is a lightweight HTTP client that connects to an OPNet node's REST and JSON-RPC APIs to retrieve unspent transaction outputs (UTXOs), broadcast signed transactions, and perform UTXO management operations such as splitting. It is the primary way to fund transaction builders before signing and broadcasting.

The provider fetches UTXOs via the node's REST endpoint, automatically filters out already-spent outputs, and accumulates UTXOs until the requested amount is met. Transaction broadcasting uses the node's JSON-RPC interface (`btc_sendRawTransaction`).

**Source:** `src/utxo/OPNetLimitedProvider.ts`

## Table of Contents

- [Constructor](#constructor)
- [Interfaces](#interfaces)
  - [FetchUTXOParams](#fetchutxoparams)
  - [FetchUTXOParamsMultiAddress](#fetchutxoparamsmultiaddress)
  - [UTXO](#utxo)
  - [BroadcastResponse](#broadcastresponse)
  - [WalletUTXOs](#walletutxos)
- [Methods](#methods)
  - [fetchUTXO](#fetchutxo)
  - [fetchUTXOMultiAddr](#fetchutxomultiaddr)
  - [broadcastTransaction](#broadcasttransaction)
  - [splitUTXOs](#splitutxos)
  - [rpcMethod](#rpcmethod)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Constructor

```typescript
import { OPNetLimitedProvider } from '@btc-vision/transaction';

const provider = new OPNetLimitedProvider('https://regtest.opnet.org');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `opnetAPIUrl` | `string` | The base URL of an OPNet node API (e.g., `https://regtest.opnet.org`). |

The provider uses two internal paths:
- **REST:** `{opnetAPIUrl}/api/v1/address/utxos` for UTXO fetching.
- **JSON-RPC:** `{opnetAPIUrl}/api/v1/json-rpc` for transaction broadcasting and other RPC calls.

---

## Interfaces

### FetchUTXOParams

Parameters for fetching UTXOs from a single address.

```typescript
interface FetchUTXOParams {
    readonly address: string;
    readonly minAmount: bigint;
    readonly requestedAmount: bigint;
    optimized?: boolean | undefined;
    usePendingUTXO?: boolean | undefined;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `address` | `string` | -- | The Bitcoin address to fetch UTXOs for. |
| `minAmount` | `bigint` | -- | Minimum satoshi value per UTXO. UTXOs below this value are filtered out. |
| `requestedAmount` | `bigint` | -- | Target satoshi amount. The provider stops accumulating UTXOs once this amount is exceeded. |
| `optimized` | `boolean` | `true` | Whether to request optimized UTXO selection from the node. |
| `usePendingUTXO` | `boolean` | `true` | Whether to include pending (unconfirmed) UTXOs alongside confirmed ones. |

### FetchUTXOParamsMultiAddress

Parameters for fetching UTXOs across multiple addresses.

```typescript
interface FetchUTXOParamsMultiAddress {
    readonly addresses: string[];
    readonly minAmount: bigint;
    readonly requestedAmount: bigint;
    readonly optimized?: boolean;
    readonly usePendingUTXO?: boolean;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `addresses` | `string[]` | Array of Bitcoin addresses to fetch UTXOs from. All addresses are queried in parallel. |
| `minAmount` | `bigint` | Minimum satoshi value per UTXO. |
| `requestedAmount` | `bigint` | Target satoshi amount across all addresses combined. |
| `optimized` | `boolean` | Whether to request optimized selection. |
| `usePendingUTXO` | `boolean` | Whether to include pending UTXOs. |

### UTXO

Represents a single unspent transaction output ready for use as a transaction input.

```typescript
interface UTXO {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly value: bigint;
    readonly scriptPubKey: ScriptPubKey;

    redeemScript?: string | Uint8Array;
    witnessScript?: string | Uint8Array;
    nonWitnessUtxo?: string | Uint8Array;
    signer?: RotationSignerBase;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `transactionId` | `string` | The transaction hash containing this output. |
| `outputIndex` | `number` | The index of this output within the transaction. |
| `value` | `bigint` | The value in satoshis. |
| `scriptPubKey` | `ScriptPubKey` | The locking script of the output (from `@btc-vision/bitcoin-rpc`). |
| `nonWitnessUtxo` | `string \| Uint8Array` | The full raw transaction (required for signing non-SegWit inputs). Populated automatically by the provider. |
| `signer` | `RotationSignerBase` | Optional per-UTXO signer for address rotation mode. |

### BroadcastResponse

Response from the OPNet node after broadcasting a transaction.

```typescript
interface BroadcastResponse {
    success: boolean;
    result?: string;
    error?: string;
    peers?: number;
    identifier: bigint;
    modifiedTransaction?: string;
    created?: boolean;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `success` | `boolean` | Whether the broadcast succeeded. |
| `result` | `string` | The transaction ID if successful. |
| `error` | `string` | Error message if the broadcast failed. |
| `peers` | `number` | Number of peers the transaction was relayed to. |
| `identifier` | `bigint` | OPNet internal identifier for the transaction. |
| `modifiedTransaction` | `string` | Modified transaction hex if the node altered it. |
| `created` | `boolean` | Whether a new OPNet transaction was created. |

### WalletUTXOs

Raw response structure from the UTXO REST endpoint.

```typescript
interface WalletUTXOs {
    readonly confirmed: RawUTXOResponse[];
    readonly pending: RawUTXOResponse[];
    readonly spentTransactions: RawUTXOResponse[];
    readonly raw: string[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `confirmed` | `RawUTXOResponse[]` | Confirmed UTXOs. |
| `pending` | `RawUTXOResponse[]` | Pending (unconfirmed) UTXOs. |
| `spentTransactions` | `RawUTXOResponse[]` | UTXOs that have been spent (used for filtering). |
| `raw` | `string[]` | Base64-encoded raw transactions, indexed by the `raw` field of each UTXO response. |

---

## Methods

### fetchUTXO

```typescript
public async fetchUTXO(settings: FetchUTXOParams): Promise<UTXO[]>
```

Fetches UTXOs from the OPNet node for a single address. The method filters out spent transactions, applies the `minAmount` threshold, and accumulates UTXOs until the `requestedAmount` is exceeded.

| Parameter | Type | Description |
|-----------|------|-------------|
| `settings` | `FetchUTXOParams` | UTXO fetch parameters. |

**Returns:** `Promise<UTXO[]>` -- Array of UTXOs with `value` as `bigint` and `nonWitnessUtxo` populated.

**Throws:**
- `Error` if the HTTP request fails.
- `Error('No UTXO found')` if no unspent UTXOs exist for the address.
- `Error('No UTXO found (minAmount)')` if no UTXOs meet the minimum amount threshold.
- `Error` if any UTXO has an invalid raw transaction index.

**Behavior:**
1. Queries `GET /api/v1/address/utxos?address={address}&optimize={optimized}`.
2. Merges confirmed and pending UTXOs (if `usePendingUTXO` is true).
3. Removes UTXOs that appear in the `spentTransactions` list.
4. Filters by `minAmount`.
5. Accumulates UTXOs until `currentAmount > requestedAmount`, then stops.

### fetchUTXOMultiAddr

```typescript
public async fetchUTXOMultiAddr(settings: FetchUTXOParamsMultiAddress): Promise<UTXO[]>
```

Fetches UTXOs from multiple addresses in parallel and combines the results. Individual address failures are silently ignored (they return empty arrays).

| Parameter | Type | Description |
|-----------|------|-------------|
| `settings` | `FetchUTXOParamsMultiAddress` | Multi-address UTXO fetch parameters. |

**Returns:** `Promise<UTXO[]>` -- Combined array of UTXOs from all addresses, capped at `requestedAmount`.

### broadcastTransaction

```typescript
public async broadcastTransaction(
    transaction: string,
    psbt: boolean,
): Promise<BroadcastResponse | undefined>
```

Broadcasts a signed transaction to the Bitcoin network through the OPNet node.

| Parameter | Type | Description |
|-----------|------|-------------|
| `transaction` | `string` | The transaction hex string. |
| `psbt` | `boolean` | Whether the transaction is a PSBT (partially signed Bitcoin transaction). |

**Returns:** `Promise<BroadcastResponse | undefined>` -- The broadcast result, or `undefined` if the RPC call returned no result.

**Throws:** `Error` if the RPC request fails or returns an error.

### splitUTXOs

```typescript
public async splitUTXOs(
    wallet: Wallet,
    network: Network,
    splitInputsInto: number,
    amountPerUTXO: bigint,
): Promise<BroadcastResponse | { error: string }>
```

Splits a wallet's UTXOs into smaller denomination outputs. This is useful for preparing multiple UTXOs that can be consumed by parallel transactions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `wallet` | `Wallet` | The wallet whose UTXOs to split. |
| `network` | `Network` | The Bitcoin network. |
| `splitInputsInto` | `number` | Number of output UTXOs to create. |
| `amountPerUTXO` | `bigint` | Satoshi value per output UTXO. |

**Returns:** `Promise<BroadcastResponse | { error: string }>` -- The broadcast response or an error object.

### rpcMethod

```typescript
public async rpcMethod(method: string, paramsMethod: unknown[]): Promise<unknown>
```

Low-level JSON-RPC call to the OPNet node.

| Parameter | Type | Description |
|-----------|------|-------------|
| `method` | `string` | The RPC method name (e.g., `btc_sendRawTransaction`). |
| `paramsMethod` | `unknown[]` | Array of parameters for the method. |

**Returns:** `Promise<unknown>` -- The `result` field from the JSON-RPC response.

**Throws:** `Error` if the request fails, returns no data, or the result contains an `error` field.

---

## Examples

### Fetching UTXOs and Building a Transaction

```typescript
import { OPNetLimitedProvider, TransactionFactory } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// 1. Create a provider pointing to an OPNet node
const provider = new OPNetLimitedProvider('https://regtest.opnet.org');

// 2. Fetch UTXOs for a single address
const utxos = await provider.fetchUTXO({
    address: 'bcrt1q...',
    minAmount: 330n,               // Filter out dust UTXOs
    requestedAmount: 100_000n,     // Need at least 100,000 sats
});

console.log(`Found ${utxos.length} UTXOs`);
for (const utxo of utxos) {
    console.log(`  ${utxo.transactionId}:${utxo.outputIndex} = ${utxo.value} sats`);
}

// 3. Use UTXOs in a transaction builder
const factory = new TransactionFactory();
const tx = await factory.createBTCTransfer({
    from: 'bcrt1q...',
    to: 'bcrt1p...',
    utxos: utxos,
    signer: wallet.keypair,
    network: networks.regtest,
    amount: 50_000n,
    feeRate: 10,
    priorityFee: 0n,
    gasSatFee: 330n,
    mldsaSigner: null,
});

// 4. Broadcast the signed transaction
const result = await provider.broadcastTransaction(tx.tx, false);
if (result?.success) {
    console.log(`Transaction broadcast: ${result.result}`);
}
```

### Fetching UTXOs from Multiple Addresses

```typescript
const utxos = await provider.fetchUTXOMultiAddr({
    addresses: [wallet.p2wpkh, wallet.p2tr],
    minAmount: 330n,
    requestedAmount: 500_000n,
});

console.log(`Total UTXOs from both addresses: ${utxos.length}`);
```

### Splitting UTXOs for Parallel Transactions

```typescript
const result = await provider.splitUTXOs(
    wallet,
    networks.regtest,
    10,         // Create 10 output UTXOs
    50_000n,    // 50,000 sats each
);

if ('error' in result) {
    console.error(result.error);
} else {
    console.log(`Split broadcast: ${result.success}`);
}
```

### Making a Custom RPC Call

```typescript
const result = await provider.rpcMethod('btc_getBlockCount', []);
console.log(`Current block height: ${result}`);
```

---

## Related Documentation

- [Transaction Factory](../transaction-building/transaction-factory.md) -- How to build and sign transactions
- [Funding Transactions](../transaction-building/funding-transactions.md) -- BTC transfer and funding flows
- [Wallet](../keypair/wallet.md) -- Key pair management and address derivation
