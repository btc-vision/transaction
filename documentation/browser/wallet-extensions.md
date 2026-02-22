# Wallet Extension Integrations

Browser wallet signers for Unisat and Xverse wallet extensions.

## Overview

OPNet provides two concrete browser wallet signers -- `UnisatSigner` and `XverseSigner` -- that bridge between browser wallet extensions and the OPNet transaction building system. Both extend the abstract `CustomKeypair` class (which implements the `Signer` interface from `@btc-vision/bitcoin`) and handle the PSBT-based signing flow required by browser wallets.

In a browser environment, the transaction builder's `signer` parameter is set to one of these signers. When a transaction needs to be signed, the signer delegates to the wallet extension (injected into the `window` object) rather than performing cryptographic operations directly. This means the user's private keys never leave the wallet extension.

**Sources:**
- `src/transaction/browser/extensions/UnisatSigner.ts`
- `src/transaction/browser/extensions/XverseSigner.ts`
- `src/transaction/browser/BrowserSignerBase.ts`

## Table of Contents

- [CustomKeypair Base Class](#customkeypair-base-class)
- [UnisatSigner](#unisatsigner)
  - [Setup and Initialization](#unisat-setup-and-initialization)
  - [Properties](#unisat-properties)
  - [Methods](#unisat-methods)
- [XverseSigner](#xversesigner)
  - [Setup and Initialization](#xverse-setup-and-initialization)
  - [Properties](#xverse-properties)
  - [Methods](#xverse-methods)
- [PSBT Signing Flow](#psbt-signing-flow)
- [When Signer Is Null](#when-signer-is-null)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## CustomKeypair Base Class

Both signers extend `CustomKeypair`, which defines the abstract interface for browser-based signing.

```typescript
abstract class CustomKeypair implements Signer {
    abstract network: Network;
    abstract publicKey: PublicKey;
    abstract addresses: string[];
    abstract p2tr: string;
    abstract p2wpkh: string;

    abstract init(): Promise<void>;
    abstract getPublicKey(): PublicKey;
    abstract signTaprootInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void>;
    abstract signInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void>;
    abstract sign(hash: MessageHash, lowR?: boolean): Signature;
    abstract signSchnorr(hash: MessageHash): SchnorrSignature;
    abstract verify(hash: MessageHash, signature: Signature): boolean;
}
```

> **Important:** The `sign()`, `signSchnorr()`, and `verify()` methods throw `'Not implemented'` errors on both signers. These synchronous methods cannot delegate to an asynchronous browser extension. All actual signing goes through `signTaprootInput()` and `signInput()`, which pass the entire PSBT to the wallet extension.

---

## UnisatSigner

Integrates with the Unisat wallet browser extension (`window.unisat`).

### Unisat Setup and Initialization

```typescript
import { UnisatSigner } from '@btc-vision/transaction';

// Must be in a browser environment
const signer = new UnisatSigner();

// Initialize: detects network, fetches public key, derives addresses
await signer.init();

console.log(signer.network);  // networks.bitcoin | networks.testnet | networks.opnetTestnet | networks.regtest
console.log(signer.p2tr);     // Taproot address (bc1p...)
console.log(signer.p2wpkh);   // SegWit address (bc1q...)
```

The constructor throws if `window` is not available (i.e., not in a browser). The `init()` method:

1. Calls `unisat.getNetwork()` to detect the active network (Mainnet, Testnet, OpnetTestnet, or Regtest).
2. Calls `unisat.getPublicKey()` to retrieve the user's public key.
3. Derives P2TR and P2WPKH addresses from the public key.
4. Stores the addresses for later use.

### Unisat Properties

| Property | Type | Description |
|----------|------|-------------|
| `network` | `Network` | The detected Bitcoin network. Throws if not initialized. |
| `publicKey` | `PublicKey` | The user's compressed public key. Throws if not initialized. |
| `p2tr` | `string` | The user's Taproot address. |
| `p2wpkh` | `string` | The user's native SegWit address. |
| `addresses` | `string[]` | Array containing `[p2wpkh, p2tr]`. |

### Unisat Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `init()` | `Promise<void>` | Initializes the signer by connecting to the Unisat extension. |
| `getPublicKey()` | `PublicKey` | Returns the user's public key (must be initialized first). |
| `signData(data, type)` | `Promise<Uint8Array>` | Signs raw data using the specified signature type (`ecdsa` or `schnorr`). |
| `signTaprootInput(tx, i, sighashTypes)` | `Promise<void>` | Signs a Taproot input by delegating to `unisat.signPsbt()`. |
| `signInput(tx, i, sighashTypes)` | `Promise<void>` | Signs a non-Taproot input by delegating to `unisat.signPsbt()`. |
| `multiSignPsbt(transactions)` | `Promise<void>` | Signs PSBTs via `unisat.signPsbt()`. **Note:** Currently only signs the first PSBT in the array despite accepting multiple. |

**Signing details:**
- `signTaprootInput` sends the entire PSBT to Unisat as hex with `disableTweakSigner: false`.
- `signInput` sends the PSBT with `disableTweakSigner: true` (non-Taproot inputs use untweaked keys).
- Both methods skip already-signed inputs (detected by checking `tapKeySig`, `finalScriptSig`, `partialSig`, or `tapScriptSig`).
- The signed result is combined back into the original PSBT.

---

## XverseSigner

Integrates with the Xverse wallet browser extension (`window.BitcoinProvider`).

### Xverse Setup and Initialization

```typescript
import { XverseSigner } from '@btc-vision/transaction';

const signer = new XverseSigner();
await signer.init();

console.log(signer.network);  // Detected from address prefix
console.log(signer.p2tr);     // Taproot address
console.log(signer.p2wpkh);   // SegWit address
```

The `init()` method:

1. Calls `BitcoinProvider.request('wallet_connect', null)` to connect.
2. Finds the payment address from the connection result.
3. Infers the network from the address prefix (`opt` = opnetTestnet, `tb` = testnet, `bc` = mainnet).
4. Extracts the public key and derives P2TR and P2WPKH addresses.

### Xverse Properties

| Property | Type | Description |
|----------|------|-------------|
| `network` | `Network` | The detected Bitcoin network. |
| `publicKey` | `PublicKey` | The user's compressed public key. |
| `p2tr` | `string` | The user's Taproot address. |
| `p2wpkh` | `string` | The user's native SegWit address. |
| `addresses` | `string[]` | Array containing `[p2wpkh, p2tr]`. |

### Xverse Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `init()` | `Promise<void>` | Connects to the Xverse wallet and retrieves credentials. |
| `getPublicKey()` | `PublicKey` | Returns the user's public key. |
| `signData(data, address, protocol)` | `Promise<Uint8Array>` | Signs data via `BitcoinProvider.request('signMessage', ...)`. |
| `signTaprootInput(tx, i, sighashTypes)` | `Promise<void>` | Signs a Taproot input via `BitcoinProvider.request('signPsbt', ...)`. |
| `signInput(tx, i, sighashTypes)` | `Promise<void>` | Signs a non-Taproot input. |
| `multiSignPsbt(transactions)` | `Promise<void>` | Signs PSBTs via `BitcoinProvider`. **Note:** Currently only signs the first PSBT in the array despite accepting multiple. |

**Key differences from UnisatSigner:**
- Xverse uses base64-encoded PSBTs (not hex).
- Xverse uses the `BitcoinProvider.request('signPsbt', ...)` API with `signInputs` mapped by address.
- Connection is established through `wallet_connect` rather than direct API calls.

---

## PSBT Signing Flow

Both signers follow the same overall flow when signing transaction inputs:

```
1. Transaction builder creates a PSBT with unsigned inputs.

2. For each input, the signer determines:
   - Is it a Taproot input? (check tapLeafScript, tapInternalKey)
   - Is it a non-Taproot input? (check witnessUtxo, redeemScript)
   - Does it need our signature? (compare public keys)
   - Is it already signed? (check tapKeySig, partialSig, tapScriptSig)

3. The PSBT is serialized (hex for Unisat, base64 for Xverse)
   and passed to the wallet extension.

4. The wallet extension prompts the user, signs, and returns
   the signed PSBT.

5. The signer deserializes the result and combines the new
   signatures into the original PSBT.
```

The `disableTweakSigner` flag is critical:
- `false` for Taproot key-path spends (wallet applies the tweak internally).
- `true` for Taproot script-path spends and non-Taproot inputs (OPNet uses original untweaked keys for script verification).

---

## When Signer Is Null

In the OPNet transaction system, a `null` signer signals a **browser environment** where a wallet extension handles signing. Transaction parameters use types like `InteractionParametersWithoutSigner` that omit the `signer` field entirely.

```typescript
// Server-side: provide a signer
const params: IInteractionParameters = {
    signer: wallet.keypair,     // ECPairInterface
    // ...
};

// Browser: no signer needed -- wallet extension signs
const params: InteractionParametersWithoutSigner = {
    // signer field does not exist
    // ...
};
```

When transaction builders encounter a browser signer (`CustomKeypair` instance), they pass the full PSBT to the signer's `signTaprootInput` / `signInput` methods rather than calling `sign()` directly.

---

## Examples

### Using UnisatSigner for a Contract Interaction

```typescript
import { UnisatSigner, OPNetLimitedProvider } from '@btc-vision/transaction';

// Initialize the signer
const signer = new UnisatSigner();
await signer.init();

// Fetch UTXOs using the signer's addresses
const provider = new OPNetLimitedProvider('https://regtest.opnet.org');
const utxos = await provider.fetchUTXOMultiAddr({
    addresses: signer.addresses,
    minAmount: 330n,
    requestedAmount: 100_000n,
});

// Build and sign an interaction (Web3Provider handles the rest)
// The signer is used internally by the Web3Provider implementation
```

### Detecting Available Wallets

```typescript
function getAvailableWallet(): 'unisat' | 'xverse' | null {
    if (typeof window === 'undefined') return null;
    if ((window as any).unisat) return 'unisat';
    if ((window as any).BitcoinProvider) return 'xverse';
    return null;
}

async function createSigner() {
    const wallet = getAvailableWallet();

    switch (wallet) {
        case 'unisat': {
            const signer = new UnisatSigner();
            await signer.init();
            return signer;
        }
        case 'xverse': {
            const signer = new XverseSigner();
            await signer.init();
            return signer;
        }
        default:
            throw new Error('No supported wallet extension found');
    }
}
```

---

## Related Documentation

- [Web3Provider](./web3-provider.md) -- The interface that wallet implementations fulfill
- [Transaction Factory](../transaction-building/transaction-factory.md) -- How transactions are constructed and signed
- [Offline Transaction Signing](../offline/offline-transaction-signing.md) -- Server-side signing without browser wallets
