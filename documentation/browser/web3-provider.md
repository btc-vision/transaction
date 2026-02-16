# Web3Provider

Generic browser wallet provider interface for OPNet transaction signing and broadcasting.

## Overview

`Web3Provider` is a TypeScript interface that defines the contract between browser wallet extensions and the OPNet transaction building system. Any wallet that implements this interface can sign interactions, deploy contracts, cancel transactions, and broadcast to the network -- all without the user's private keys ever leaving the wallet extension.

The interface is designed to work in browser environments where wallet extensions (such as OP_WALLET, Unisat, or Xverse) manage keys and signing. Transaction builders create unsigned PSBTs, pass them to the wallet through this interface, and receive signed transactions back for broadcasting.

**Source:** `src/transaction/browser/Web3Provider.ts`

## Table of Contents

- [Import](#import)
- [Interface Definition](#interface-definition)
- [Methods](#methods)
  - [signInteraction](#signinteraction)
  - [signAndBroadcastInteraction](#signandbroadcastinteraction)
  - [cancelTransaction](#canceltransaction)
  - [customTransaction](#customtransaction)
  - [deployContract](#deploycontract)
  - [broadcast](#broadcast)
  - [signSchnorr](#signschnorr)
  - [getMLDSAPublicKey](#getmldsapublickey)
  - [signMLDSAMessage](#signmldsamessage)
  - [verifyMLDSASignature](#verifymldsa-signature)
- [Supporting Types](#supporting-types)
- [Browser-Specific Considerations](#browser-specific-considerations)
- [Integration Flow](#integration-flow)
- [Related Documentation](#related-documentation)

---

## Import

```typescript
import type { Web3Provider } from '@btc-vision/transaction';
```

## Interface Definition

```typescript
interface Web3Provider {
    signInteraction(params: InteractionParametersWithoutSigner): Promise<InteractionResponse>;

    signAndBroadcastInteraction(
        params: InteractionParametersWithoutSigner,
    ): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[], string]>;

    cancelTransaction(params: ICancelTransactionParametersWithoutSigner): Promise<CancelledTransaction>;

    customTransaction(params: ICustomTransactionWithoutSigner): Promise<BroadcastedTransaction>;

    deployContract(params: IDeploymentParametersWithoutSigner): Promise<DeploymentResult>;

    broadcast(transactions: BroadcastTransactionOptions[]): Promise<BroadcastedTransaction[]>;

    signSchnorr(message: string): Promise<string>;

    getMLDSAPublicKey(): Promise<string>;

    signMLDSAMessage(message: string): Promise<MLDSASignature>;

    verifyMLDSASignature(message: string, signature: MLDSASignature): Promise<boolean>;
}
```

---

## Methods

### signInteraction

```typescript
signInteraction(params: InteractionParametersWithoutSigner): Promise<InteractionResponse>
```

Signs a smart contract interaction without broadcasting. The wallet builds a PSBT, signs it, and returns the signed transaction data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `params` | `InteractionParametersWithoutSigner` | Interaction parameters (contract address, calldata, UTXOs, fee rate, etc.) without the `signer` and `challenge` fields. |

**Returns:** `Promise<InteractionResponse>` -- The signed interaction transaction ready for broadcasting.

### signAndBroadcastInteraction

```typescript
signAndBroadcastInteraction(
    params: InteractionParametersWithoutSigner,
): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[], string]>
```

Signs a smart contract interaction and immediately broadcasts it. Returns a tuple containing both the funding and interaction broadcast results, remaining UTXOs, and the transaction hex.

| Parameter | Type | Description |
|-----------|------|-------------|
| `params` | `InteractionParametersWithoutSigner` | Interaction parameters without signer fields. |

**Returns:** `Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[], string]>` -- A tuple of `[fundingResult, interactionResult, remainingUTXOs, txHex]`.

### cancelTransaction

```typescript
cancelTransaction(params: ICancelTransactionParametersWithoutSigner): Promise<CancelledTransaction>
```

Creates and signs a transaction that replaces (cancels) a pending transaction using Replace-By-Fee (RBF).

| Parameter | Type | Description |
|-----------|------|-------------|
| `params` | `ICancelTransactionParametersWithoutSigner` | Cancellation parameters without signer fields. |

**Returns:** `Promise<CancelledTransaction>` -- The signed cancellation transaction.

### customTransaction

```typescript
customTransaction(params: ICustomTransactionWithoutSigner): Promise<BroadcastedTransaction>
```

Creates, signs, and broadcasts a custom transaction with arbitrary script data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `params` | `ICustomTransactionWithoutSigner` | Custom transaction parameters without signer fields. |

**Returns:** `Promise<BroadcastedTransaction>` -- The broadcast result.

### deployContract

```typescript
deployContract(params: IDeploymentParametersWithoutSigner): Promise<DeploymentResult>
```

Deploys a smart contract to the OPNet network. The wallet signs the deployment transaction containing the contract bytecode.

| Parameter | Type | Description |
|-----------|------|-------------|
| `params` | `IDeploymentParametersWithoutSigner` | Deployment parameters (bytecode, salt, calldata, etc.) without signer and network fields. |

**Returns:** `Promise<DeploymentResult>` -- The deployment result including the contract address.

### broadcast

```typescript
broadcast(transactions: BroadcastTransactionOptions[]): Promise<BroadcastedTransaction[]>
```

Broadcasts one or more pre-signed transactions to the network.

| Parameter | Type | Description |
|-----------|------|-------------|
| `transactions` | `BroadcastTransactionOptions[]` | Array of transactions to broadcast, each with `raw` (hex string) and `psbt` (boolean) fields. |

**Returns:** `Promise<BroadcastedTransaction[]>` -- Array of broadcast results.

### signSchnorr

```typescript
signSchnorr(message: string): Promise<string>
```

Signs a message using Schnorr signature via the wallet extension.

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | Hexadecimal string message to sign. |

**Returns:** `Promise<string>` -- The Schnorr signature in hex format.

**Throws:** `Error` if signing fails or the wallet is not connected.

### getMLDSAPublicKey

```typescript
getMLDSAPublicKey(): Promise<string>
```

Retrieves the ML-DSA (quantum-resistant) public key from the wallet. Never exposes private keys.

**Returns:** `Promise<string>` -- The ML-DSA public key in hex format.

### signMLDSAMessage

```typescript
signMLDSAMessage(message: string): Promise<MLDSASignature>
```

Signs a message using ML-DSA (quantum-resistant) signature.

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | The message to sign as a hexadecimal string. |

**Returns:** `Promise<MLDSASignature>` -- An object containing `signature`, `publicKey`, `securityLevel`, and `messageHash`.

### verifyMLDSASignature

```typescript
verifyMLDSASignature(message: string, signature: MLDSASignature): Promise<boolean>
```

Verifies an ML-DSA signature.

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | The original message as a hexadecimal string. |
| `signature` | `MLDSASignature` | The ML-DSA signature to verify. |

**Returns:** `Promise<boolean>` -- `true` if the signature is valid.

---

## Supporting Types

### InteractionParametersWithoutSigner

```typescript
type InteractionParametersWithoutSigner = Omit<
    IInteractionParameters,
    'signer' | 'challenge' | 'mldsaSigner'
>;
```

All standard interaction parameters except `signer`, `challenge`, and `mldsaSigner` -- these are managed internally by the wallet.

### BroadcastTransactionOptions

```typescript
interface BroadcastTransactionOptions {
    raw: string;     // Transaction hex
    psbt: boolean;   // Whether it is a PSBT
}
```

### BroadcastedTransaction

```typescript
interface BroadcastedTransaction {
    readonly success: boolean;
    readonly result?: string;
    readonly error?: string;
    readonly peers?: number;
}
```

### MLDSASignature

```typescript
interface MLDSASignature {
    readonly signature: string;        // ML-DSA signature in hex
    readonly publicKey: string;        // ML-DSA public key in hex
    readonly securityLevel: MLDSASecurityLevel;  // 44, 65, or 87
    readonly messageHash: string;      // Hash of the signed message
}
```

---

## Browser-Specific Considerations

1. **No private keys in application code.** All `WithoutSigner` parameter types omit the `signer` field. The wallet extension holds the keys and performs signing internally.

2. **PSBT-based signing flow.** Transaction builders create unsigned PSBTs, which are passed to the wallet extension. The extension signs relevant inputs and returns the signed PSBT, which is then finalized and broadcast.

3. **Wallet detection.** Before using a `Web3Provider` implementation, ensure the wallet extension is detected in the browser. Wallet extensions inject themselves into `window` (e.g., `window.unisat`, `window.BitcoinProvider`, `window.opnet`).

4. **Network consistency.** The wallet's network setting must match the application's intended network. Mismatches will result in invalid transactions.

5. **Asynchronous initialization.** Browser wallet signers require an `init()` call to detect the wallet, fetch the public key, and determine the network before any signing operations.

---

## Integration Flow

```
Application                  Web3Provider               Wallet Extension
    |                              |                           |
    |-- signInteraction(params) -->|                           |
    |                              |-- Build unsigned PSBT --> |
    |                              |                           |
    |                              |<-- Sign PSBT ------------|
    |                              |                           |
    |                              |-- Finalize & return ----->|
    |<-- InteractionResponse ------|                           |
    |                              |                           |
    |-- broadcast(txOptions) ----->|                           |
    |                              |-- POST to OPNet node ---->|
    |<-- BroadcastedTransaction ---|                           |
```

---

## Related Documentation

- [Wallet Extensions](./wallet-extensions.md) -- UnisatSigner and XverseSigner implementations
- [Transaction Building](../transaction-building.md) -- How transactions are constructed
- [Offline Transaction Signing](../offline-transaction-signing.md) -- Server-side signing alternative
