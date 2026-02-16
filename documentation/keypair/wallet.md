# Wallet

Manages both classical (ECDSA/Schnorr) and quantum-resistant (ML-DSA) key pairs in a unified interface. The `Wallet` class encapsulates key derivation, address generation for all Bitcoin address types, and secure disposal of private key material. It integrates with the `Mnemonic` class for BIP39/BIP360 hierarchical deterministic derivation.

The `Wallet` implements `Disposable` for secure zeroing of private key buffers.

## Table of Contents

- [Import](#import)
- [Constructor](#constructor)
- [Static Factory Methods](#static-factory-methods)
  - [Wallet.fromWif()](#walletfromwif)
  - [Wallet.fromPrivateKeys()](#walletfromprivatekeys)
  - [Wallet.generate()](#walletgenerate)
- [Address Properties](#address-properties)
- [Key Properties](#key-properties)
- [Instance Methods](#instance-methods)
  - [toWIF()](#towif)
  - [toPrivateKeyHex()](#toprivatekeyhex)
  - [toPublicKeyHex()](#topublickeyhex)
  - [toQuantumBase58()](#toquantumbase58)
  - [derivePath()](#derivepath)
  - [zeroize()](#zeroize)
  - [\[Symbol.dispose\]()](#symboldispose)
- [Integration with Mnemonic](#integration-with-mnemonic)
- [Code Examples](#code-examples)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)

## Import

```typescript
import { Wallet } from '@btc-vision/transaction';
import { MLDSASecurityLevel } from '@btc-vision/bip32';
import { networks } from '@btc-vision/bitcoin';
```

## Constructor

```typescript
new Wallet(
    privateKeyOrWif: string,
    mldsaPrivateKeyOrBase58: string,
    network?: Network,
    securityLevel?: MLDSASecurityLevel,
    chainCode?: Uint8Array,
)
```

Creates a new Wallet instance from both a classical private key and a quantum ML-DSA private key.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `privateKeyOrWif` | `string` | Yes | -- | The classical private key. Accepts `0x`-prefixed hex, raw hex, or WIF-encoded format. |
| `mldsaPrivateKeyOrBase58` | `string` | Yes | -- | The ML-DSA private key. Accepts `0x`-prefixed hex, raw hex, or base58-encoded quantum key (from `toBase58()`). |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |
| `securityLevel` | `MLDSASecurityLevel` | No | `MLDSASecurityLevel.LEVEL2` | The ML-DSA security level. Ignored if `mldsaPrivateKeyOrBase58` is base58 (level is embedded). |
| `chainCode` | `Uint8Array` | No | `new Uint8Array(32)` | The 32-byte BIP32 chain code for hierarchical derivation. |

The constructor:
1. Parses the classical private key (hex or WIF) and creates an ECDSA signer.
2. Parses the ML-DSA private key (hex or base58) and creates a quantum signer.
3. Creates an `Address` from both public keys.
4. Pre-computes all address formats (P2TR, P2WPKH, P2PKH, P2SH-P2WPKH, P2WDA).

**Throws:**
- `Error` if the ML-DSA key length does not match the expected size for the given security level.
- `Error` if the chain code is provided but is not exactly 32 bytes.

## Static Factory Methods

### Wallet.fromWif()

```typescript
static fromWif(
    wif: string,
    quantumPrivateKeyHex: string,
    network?: Network,
    securityLevel?: MLDSASecurityLevel,
    chainCode?: Uint8Array,
): Wallet
```

Creates a Wallet from a WIF-encoded classical private key and a hex-encoded quantum private key. This is a convenience wrapper around the constructor.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `wif` | `string` | Yes | -- | The WIF-encoded classical private key. |
| `quantumPrivateKeyHex` | `string` | Yes | -- | The ML-DSA private key in hex format. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |
| `securityLevel` | `MLDSASecurityLevel` | No | `LEVEL2` | The ML-DSA security level. |
| `chainCode` | `Uint8Array` | No | -- | Optional BIP32 chain code. |

**Returns:** `Wallet`

```typescript
const wallet = Wallet.fromWif(
    'L4rK1yDtCWekvXuE6oXD9jCYfFNV2cWRpVuPLBcCU2z8TrisoyY1',
    '0xaabbccdd...',
    networks.bitcoin,
);
```

### Wallet.fromPrivateKeys()

```typescript
static fromPrivateKeys(
    privateKeyHexOrWif: string,
    mldsaPrivateKeyOrBase58: string,
    network?: Network,
    securityLevel?: MLDSASecurityLevel,
    chainCode?: Uint8Array,
): Wallet
```

Creates a Wallet from either hex or WIF classical private keys and either hex or base58 quantum private keys. This is the most flexible factory method.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `privateKeyHexOrWif` | `string` | Yes | -- | Classical private key (hex or WIF). |
| `mldsaPrivateKeyOrBase58` | `string` | Yes | -- | ML-DSA private key (hex or base58). |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |
| `securityLevel` | `MLDSASecurityLevel` | No | `LEVEL2` | The ML-DSA security level. |
| `chainCode` | `Uint8Array` | No | -- | Optional BIP32 chain code. |

**Returns:** `Wallet`

### Wallet.generate()

```typescript
static generate(network?: Network, securityLevel?: MLDSASecurityLevel): Wallet
```

Generates a completely new random wallet with both classical and quantum key pairs.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |
| `securityLevel` | `MLDSASecurityLevel` | No | `LEVEL2` | The ML-DSA security level. |

**Returns:** `Wallet`

**Throws:** `Error` if quantum key generation fails.

```typescript
const wallet = Wallet.generate(networks.bitcoin, MLDSASecurityLevel.LEVEL2);
console.log(wallet.p2tr);      // 'bc1p...'
console.log(wallet.p2wpkh);    // 'bc1q...'
```

## Address Properties

All address properties are pre-computed at construction time and cached.

| Property | Type | Description |
|----------|------|-------------|
| `address` | `Address` | The unified `Address` object containing both ML-DSA hash and classical tweaked key. |
| `p2tr` | `string` | The Taproot (P2TR) address (e.g., `bc1p...`). |
| `p2wpkh` | `string` | The native SegWit (P2WPKH) address (e.g., `bc1q...`). |
| `legacy` | `string` | The legacy (P2PKH) address (e.g., `1...`). |
| `segwitLegacy` | `string` | The nested SegWit (P2SH-P2WPKH) address (e.g., `3...`). |
| `p2wda` | `IP2WSHAddress` | The P2WDA address object with `address` and `witnessScript`. |
| `addresses` | `string[]` | Array of all four standard address formats: `[p2wpkh, p2tr, legacy, segwitLegacy]`. |

```typescript
const wallet = Wallet.generate();
console.log(wallet.p2tr);        // 'bc1p...'
console.log(wallet.p2wpkh);      // 'bc1q...'
console.log(wallet.legacy);      // '1...'
console.log(wallet.segwitLegacy); // '3...'

// Get the unified Address object
const addr = wallet.address;
console.log(addr.toHex());       // ML-DSA hash (32 bytes, 0x-prefixed)
```

## Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `keypair` | `UniversalSigner` | The classical ECDSA/Schnorr key pair. Can sign and verify. |
| `mldsaKeypair` | `QuantumBIP32Interface` | The quantum ML-DSA key pair. Supports BIP32-style derivation. |
| `publicKey` | `Uint8Array` | The 33-byte compressed classical public key. |
| `tweakedPubKeyKey` | `Uint8Array` | The 32-byte x-only tweaked classical public key. |
| `xOnly` | `Uint8Array` | The x-only (32-byte) classical public key (before tweaking). |
| `quantumPublicKey` | `Uint8Array` | The raw ML-DSA public key bytes (copy). |
| `quantumPrivateKey` | `Uint8Array` | The raw ML-DSA private key bytes (copy). Throws if not available. |
| `quantumPublicKeyHex` | `string` | The ML-DSA public key as a hex string. |
| `quantumPrivateKeyHex` | `string` | The ML-DSA private key as a hex string. Throws if not available. |
| `securityLevel` | `MLDSASecurityLevel` | The ML-DSA security level of this wallet. |
| `chainCode` | `Uint8Array` | The 32-byte BIP32 chain code. |
| `network` | `Network` | The Bitcoin network this wallet is configured for. |

## Instance Methods

### toWIF()

```typescript
toWIF(): string
```

Exports the classical private key in Wallet Import Format (WIF).

**Returns:** `string` -- the WIF-encoded classical private key.

```typescript
const wif = wallet.toWIF();
console.log(wif); // 'L4rK1yDt...'
```

### toPrivateKeyHex()

```typescript
toPrivateKeyHex(): string
```

Exports the classical private key as a hex string.

**Returns:** `string`

**Throws:** `Error` if the private key is not available.

### toPublicKeyHex()

```typescript
toPublicKeyHex(): string
```

Exports the classical public key as a hex string.

**Returns:** `string`

### toQuantumBase58()

```typescript
toQuantumBase58(): string
```

Exports the quantum ML-DSA key pair in base58 encoding. This format includes the chain code and security level, making it suitable for storage and re-import.

**Returns:** `string`

```typescript
const base58 = wallet.toQuantumBase58();
// Later, reconstruct:
const restored = new Wallet('...wif...', base58, networks.bitcoin);
```

### derivePath()

```typescript
derivePath(path: string): Wallet
```

Derives a child wallet at the given BIP32 path. Both the classical and quantum keys are derived along the same path.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | A BIP32 derivation path (e.g., `"m/84'/0'/0'/0/0"`). |

**Returns:** `Wallet` -- a new child wallet.

**Throws:** `Error` if the wallet has no private key (watch-only) or if derivation fails.

```typescript
const child = wallet.derivePath("m/84'/0'/0'/0/0");
console.log(child.p2wpkh); // derived SegWit address
```

### zeroize()

```typescript
zeroize(): void
```

Zeroes all private key material in-place. This includes the classical private key, the quantum private key, and the chain code. After calling `zeroize()`, the wallet can no longer sign transactions.

> **Note:** JavaScript runtime constraints mean that copies made by the runtime (e.g., during garbage collection) cannot be zeroed. This method eliminates the primary references.

### \[Symbol.dispose\]()

```typescript
[Symbol.dispose](): void
```

Implements the `Disposable` interface. Calls `zeroize()` to securely clear all private key material.

```typescript
{
    using wallet = Wallet.generate();
    const signed = wallet.keypair.sign(messageHash);
    // ... use wallet
} // wallet.zeroize() called automatically
```

## Integration with Mnemonic

The `Wallet` class is the primary output of `Mnemonic.derive()`. When you derive wallets from a mnemonic phrase, each derived wallet contains both classical and quantum keys at the specified index.

```typescript
import { Mnemonic } from '@btc-vision/transaction';

const mnemonic = Mnemonic.generate();

// Derive the first wallet (index 0)
const wallet = mnemonic.derive(0);

// Access all address formats
console.log('Taproot:', wallet.p2tr);
console.log('SegWit:', wallet.p2wpkh);
console.log('Legacy:', wallet.legacy);

// Access key pairs for signing
const classicalSigner = wallet.keypair;
const quantumSigner   = wallet.mldsaKeypair;
```

## Code Examples

### Creating a wallet from existing keys

```typescript
import { Wallet } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const wallet = Wallet.fromPrivateKeys(
    '0xe8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35',
    '0xaabbccddee...',  // ML-DSA private key hex
    networks.bitcoin,
);

console.log('P2TR:', wallet.p2tr);
console.log('Address hex:', wallet.address.toHex());
```

### Generating a new wallet

```typescript
import { Wallet } from '@btc-vision/transaction';
import { MLDSASecurityLevel } from '@btc-vision/bip32';

const wallet = Wallet.generate(networks.bitcoin, MLDSASecurityLevel.LEVEL2);

// Save keys for later
const wif = wallet.toWIF();
const quantumBase58 = wallet.toQuantumBase58();

console.log('Save this WIF:', wif);
console.log('Save this quantum key:', quantumBase58);
```

### Exporting and restoring

```typescript
// Export
const wif = wallet.toWIF();
const quantumBase58 = wallet.toQuantumBase58();

// Restore
const restored = Wallet.fromWif(wif, quantumBase58, networks.bitcoin);
console.log(restored.p2tr === wallet.p2tr); // true
```

### Secure disposal pattern

```typescript
{
    using wallet = Wallet.fromPrivateKeys(classicalHex, quantumHex, networks.bitcoin);

    // Sign a transaction
    const signature = wallet.keypair.sign(txHash);

    // ... broadcast transaction
} // Private keys are automatically zeroed here
```

### Deriving child wallets

```typescript
const parentWallet = new Wallet(classicalWif, quantumBase58, networks.bitcoin);
const child0 = parentWallet.derivePath("m/84'/0'/0'/0/0");
const child1 = parentWallet.derivePath("m/84'/0'/0'/0/1");

console.log(child0.p2wpkh); // Different from child1
console.log(child1.p2wpkh);
```

## Best Practices

1. **Always use `[Symbol.dispose]` or call `zeroize()`** when done with a wallet to minimize exposure of private key material in memory.
2. **Prefer `Wallet.generate()` for new wallets** to ensure both classical and quantum keys are properly generated together.
3. **Store quantum keys in base58 format** (via `toQuantumBase58()`) since it includes the chain code and security level, making restoration simpler.
4. **Never log or expose private keys** in production environments. Use WIF for classical key storage and base58 for quantum key storage.
5. **Use the `Mnemonic` class for deterministic wallets** rather than storing individual private keys when managing multiple accounts.

## Related Documentation

- [Address](./address.md) -- Quantum-resistant address representation
- [EcKeyPair](./ec-keypair.md) -- Classical ECDSA/Schnorr key pair utilities
- [Mnemonic](./mnemonic.md) -- BIP39 + BIP360 quantum wallet derivation
- [AddressVerificator](./address-verificator.md) -- Address validation utilities
