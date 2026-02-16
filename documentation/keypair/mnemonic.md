# Mnemonic

Manages BIP39 mnemonic phrases with BIP360 quantum-resistant wallet derivation. The `Mnemonic` class creates both a classical BIP32 HD key tree (for ECDSA/Schnorr) and a quantum BIP32 HD key tree (for ML-DSA) from a single mnemonic seed phrase, enabling deterministic derivation of hybrid wallets that contain both key types.

The `Mnemonic` implements `Disposable` for secure zeroing of seed material.

## Table of Contents

- [Import](#import)
- [Constructor](#constructor)
- [Static Methods](#static-methods)
  - [Mnemonic.generatePhrase()](#mnemonicgeneratephrase)
  - [Mnemonic.generate()](#mnemonicgenerate)
  - [Mnemonic.validate()](#mnemonicvalidate)
- [Derivation Methods](#derivation-methods)
  - [derive()](#derive)
  - [deriveOPWallet()](#deriveopwallet)
  - [deriveMultiple()](#derivemultiple)
  - [deriveMultipleUnisat()](#derivemultipleunisat)
  - [deriveCustomPath()](#derivecustompath)
- [Root Key Access](#root-key-access)
  - [getClassicalRoot()](#getclassicalroot)
  - [getQuantumRoot()](#getquantumroot)
- [Properties](#properties)
- [Disposal Methods](#disposal-methods)
  - [zeroize()](#zeroize)
  - [\[Symbol.dispose\]()](#symboldispose)
- [Enums](#enums)
  - [MLDSASecurityLevel](#mldsasecuritylevel)
  - [MnemonicStrength](#mnemonicstrength)
  - [BIPStandard](#bipstandard)
- [Derivation Paths](#derivation-paths)
- [Code Examples](#code-examples)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)

## Import

```typescript
import { Mnemonic, MnemonicStrength, BIPStandard } from '@btc-vision/transaction';
import { MLDSASecurityLevel } from '@btc-vision/bip32';
import { networks } from '@btc-vision/bitcoin';
```

## Constructor

```typescript
new Mnemonic(
    phrase: string,
    passphrase?: string,
    network?: Network,
    securityLevel?: MLDSASecurityLevel,
)
```

Creates a Mnemonic instance from an existing BIP39 mnemonic phrase.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `phrase` | `string` | Yes | -- | A valid BIP39 mnemonic phrase (12-24 words separated by spaces). |
| `passphrase` | `string` | No | `''` | An optional BIP39 passphrase for additional entropy. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. Affects coin type in derivation paths (0 for mainnet, 1 for testnet/regtest). |
| `securityLevel` | `MLDSASecurityLevel` | No | `MLDSASecurityLevel.LEVEL2` | The ML-DSA security level for quantum key derivation. |

The constructor:
1. Validates the mnemonic phrase using BIP39.
2. Derives a 64-byte seed from the phrase and passphrase using PBKDF2.
3. Creates a classical BIP32 root key from the seed.
4. Creates a quantum BIP32 root key from the seed using the specified ML-DSA security level.

**Throws:** `Error` if the mnemonic phrase is invalid.

```typescript
const mnemonic = new Mnemonic(
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    'my-passphrase',
    networks.bitcoin,
    MLDSASecurityLevel.LEVEL2,
);
```

## Static Methods

### Mnemonic.generatePhrase()

```typescript
static generatePhrase(strength?: MnemonicStrength): string
```

Generates a new random BIP39 mnemonic phrase without creating a `Mnemonic` instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `strength` | `MnemonicStrength` | No | `MnemonicStrength.MAXIMUM` (256 bits / 24 words) | The entropy strength for phrase generation. |

**Returns:** `string` -- a space-separated BIP39 mnemonic phrase.

```typescript
const phrase = Mnemonic.generatePhrase(MnemonicStrength.MAXIMUM);
console.log(phrase); // 24-word mnemonic phrase
```

### Mnemonic.generate()

```typescript
static generate(
    strength?: MnemonicStrength,
    passphrase?: string,
    network?: Network,
    securityLevel?: MLDSASecurityLevel,
): Mnemonic
```

Generates a new random mnemonic phrase and creates a fully initialized `Mnemonic` instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `strength` | `MnemonicStrength` | No | `MnemonicStrength.MAXIMUM` | The entropy strength. |
| `passphrase` | `string` | No | `''` | Optional BIP39 passphrase. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |
| `securityLevel` | `MLDSASecurityLevel` | No | `MLDSASecurityLevel.LEVEL2` | The ML-DSA security level. |

**Returns:** `Mnemonic`

```typescript
const mnemonic = Mnemonic.generate(
    MnemonicStrength.MAXIMUM,
    '',
    networks.bitcoin,
    MLDSASecurityLevel.LEVEL2,
);

console.log(mnemonic.phrase); // Save this phrase securely!
```

### Mnemonic.validate()

```typescript
static validate(phrase: string): boolean
```

Validates whether a string is a valid BIP39 mnemonic phrase.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `phrase` | `string` | Yes | The mnemonic phrase to validate. |

**Returns:** `boolean`

```typescript
const isValid = Mnemonic.validate('abandon abandon abandon ...');
console.log(isValid); // true or false
```

## Derivation Methods

### derive()

```typescript
derive(
    index?: number,
    account?: number,
    isChange?: boolean,
    bipStandard?: BIPStandard,
): Wallet
```

Derives a `Wallet` at the specified index using standard BIP derivation paths. Both classical and quantum keys are derived from their respective root keys.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `index` | `number` | No | `0` | The address index within the account. |
| `account` | `number` | No | `0` | The account number. |
| `isChange` | `boolean` | No | `false` | Whether to derive from the change chain (`true` = change, `false` = receiving). |
| `bipStandard` | `BIPStandard` | No | `BIPStandard.BIP84` | The BIP standard for classical key derivation path. |

**Returns:** `Wallet`

**Derivation paths used:**
- Classical: `m/<purpose>'/<coin_type>'/<account>'/<change>/<index>` (purpose depends on `bipStandard`)
- Quantum: `m/360'/<coin_type>'/<account>'/<change>/<index>`

**Throws:** `Error` if key derivation fails.

```typescript
const wallet0 = mnemonic.derive(0);  // First wallet
const wallet1 = mnemonic.derive(1);  // Second wallet

console.log(wallet0.p2tr);     // Taproot address for wallet 0
console.log(wallet1.p2wpkh);   // SegWit address for wallet 1
```

### deriveOPWallet()

```typescript
deriveOPWallet(
    addressType?: AddressTypes,
    index?: number,
    account?: number,
    isChange?: boolean,
): Wallet
```

Derives a wallet using OPWallet-compatible derivation paths. This uses the same path format as the OPWallet browser extension, where the classical key purpose is determined by the target address type.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `addressType` | `AddressTypes` | No | `AddressTypes.P2TR` | The target address type, which determines the classical derivation purpose. |
| `index` | `number` | No | `0` | The address index. |
| `account` | `number` | No | `0` | The account number. |
| `isChange` | `boolean` | No | `false` | Whether to derive from the change chain. |

**Returns:** `Wallet`

**Classical purpose mapping:**

| Address Type | Purpose | Classical Path |
|-------------|---------|----------------|
| `P2PKH` | 44 | `m/44'/0'/<account>'/<change>/<index>` |
| `P2SH_OR_P2SH_P2WPKH` | 49 | `m/49'/0'/<account>'/<change>/<index>` |
| `P2WPKH` | 84 | `m/84'/0'/<account>'/<change>/<index>` |
| `P2TR` | 86 | `m/86'/0'/<account>'/<change>/<index>` |

The quantum path is always `m/360'/<coin_type>'/<account>'/<change>/<index>`.

**Throws:** `Error` for unsupported address types.

```typescript
import { AddressTypes } from '@btc-vision/transaction';

const taprootWallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
const segwitWallet  = mnemonic.deriveOPWallet(AddressTypes.P2WPKH, 0);

console.log(taprootWallet.p2tr);    // Taproot address
console.log(segwitWallet.p2wpkh);   // SegWit address
```

### deriveMultiple()

```typescript
deriveMultiple(
    count: number,
    startIndex?: number,
    account?: number,
    isChange?: boolean,
    bipStandard?: BIPStandard,
): Wallet[]
```

Derives multiple wallets in sequence starting from `startIndex`.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `count` | `number` | Yes | -- | The number of wallets to derive. |
| `startIndex` | `number` | No | `0` | The starting address index. |
| `account` | `number` | No | `0` | The account number. |
| `isChange` | `boolean` | No | `false` | Whether to use the change chain. |
| `bipStandard` | `BIPStandard` | No | `BIPStandard.BIP84` | The BIP standard for classical paths. |

**Returns:** `Wallet[]`

```typescript
const wallets = mnemonic.deriveMultiple(5);
for (const w of wallets) {
    console.log(w.p2tr);
}
```

### deriveMultipleUnisat()

```typescript
deriveMultipleUnisat(
    addressType?: AddressTypes,
    count?: number,
    startIndex?: number,
    account?: number,
    isChange?: boolean,
): Wallet[]
```

Derives multiple wallets using OPWallet-compatible paths.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `addressType` | `AddressTypes` | No | `AddressTypes.P2TR` | The target address type. |
| `count` | `number` | No | `5` | Number of wallets to derive. |
| `startIndex` | `number` | No | `0` | Starting index. |
| `account` | `number` | No | `0` | Account number. |
| `isChange` | `boolean` | No | `false` | Use change chain. |

**Returns:** `Wallet[]`

### deriveCustomPath()

```typescript
deriveCustomPath(classicalPath: string, quantumPath: string): Wallet
```

Derives a wallet using fully custom derivation paths for both classical and quantum keys.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `classicalPath` | `string` | Yes | The BIP32 derivation path for the classical key (e.g., `"m/44'/0'/0'/0/0"`). |
| `quantumPath` | `string` | Yes | The BIP32 derivation path for the quantum key (e.g., `"m/360'/0'/0'/0/0"`). |

**Returns:** `Wallet`

**Throws:** `Error` if either derivation fails.

```typescript
const wallet = mnemonic.deriveCustomPath(
    "m/86'/0'/0'/0/0",   // Classical: BIP86 Taproot
    "m/360'/0'/0'/0/0",  // Quantum: BIP360
);
```

## Root Key Access

### getClassicalRoot()

```typescript
getClassicalRoot(): BIP32Interface
```

Returns the classical BIP32 root key derived from the seed. This can be used for manual derivation or inspection.

**Returns:** `BIP32Interface`

### getQuantumRoot()

```typescript
getQuantumRoot(): QuantumBIP32Interface
```

Returns the quantum BIP32 root key derived from the seed. This can be used for manual derivation or inspection.

**Returns:** `QuantumBIP32Interface`

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `phrase` | `string` | The BIP39 mnemonic phrase (read-only). |
| `network` | `Network` | The Bitcoin network this mnemonic is configured for. |
| `securityLevel` | `MLDSASecurityLevel` | The ML-DSA security level used for quantum key derivation. |
| `seed` | `Uint8Array` | A copy of the 64-byte seed derived from the mnemonic and passphrase. |

## Disposal Methods

### zeroize()

```typescript
zeroize(): void
```

Zeroes the seed buffer and root private keys in-place. The mnemonic phrase and passphrase are JavaScript strings and cannot be zeroed by the runtime.

### \[Symbol.dispose\]()

```typescript
[Symbol.dispose](): void
```

Implements the `Disposable` interface. Calls `zeroize()` to clear secret material.

```typescript
{
    using mnemonic = Mnemonic.generate();
    const wallet = mnemonic.derive(0);
    // ... use wallet
} // seed and root keys are zeroed automatically
```

## Enums

### MLDSASecurityLevel

Imported from `@btc-vision/bip32`. Defines the ML-DSA (FIPS 204) security level for quantum-resistant key generation.

| Level | Enum Value | ML-DSA Variant | Public Key Size | Description |
|-------|-----------|----------------|-----------------|-------------|
| Level 2 | `MLDSASecurityLevel.LEVEL2` | ML-DSA-44 | 1312 bytes | **Recommended default.** Sufficient quantum resistance with smaller keys. |
| Level 3 | `MLDSASecurityLevel.LEVEL3` | ML-DSA-65 | 1952 bytes | Higher security margin. |
| Level 5 | `MLDSASecurityLevel.LEVEL5` | ML-DSA-87 | 2592 bytes | Maximum security. Significantly larger keys and signatures. |

### MnemonicStrength

Defines the entropy strength (in bits) for mnemonic phrase generation. Higher entropy produces longer phrases with more security.

| Strength | Enum Value | Entropy | Word Count |
|----------|-----------|---------|------------|
| Minimum | `MnemonicStrength.MINIMUM` | 128 bits | 12 words |
| Low | `MnemonicStrength.LOW` | 160 bits | 15 words |
| Medium | `MnemonicStrength.MEDIUM` | 192 bits | 18 words |
| High | `MnemonicStrength.HIGH` | 224 bits | 21 words |
| Maximum | `MnemonicStrength.MAXIMUM` | 256 bits | 24 words |

### BIPStandard

Defines the BIP derivation path standard for classical keys. The quantum path always uses BIP360 (`m/360'/...`).

| Standard | Enum Value | Purpose | Path Pattern | Address Type |
|----------|-----------|---------|--------------|-------------|
| BIP44 | `BIPStandard.BIP44` | 44 | `m/44'/<coin>/<acct>/<change>/<idx>` | P2PKH (legacy) |
| BIP49 | `BIPStandard.BIP49` | 49 | `m/49'/<coin>/<acct>/<change>/<idx>` | P2SH-P2WPKH (nested SegWit) |
| BIP84 | `BIPStandard.BIP84` | 84 | `m/84'/<coin>/<acct>/<change>/<idx>` | P2WPKH (native SegWit) -- **DEFAULT** |
| BIP86 | `BIPStandard.BIP86` | 86 | `m/86'/<coin>/<acct>/<change>/<idx>` | P2TR (Taproot) |

## Derivation Paths

### Classical Paths

The classical derivation path follows the standard BIP32 format:

```
m/<purpose>'/<coin_type>'/<account>'/<change>/<index>
```

- **purpose**: Determined by `BIPStandard` (44, 49, 84, or 86).
- **coin_type**: `0` for mainnet, `1` for testnet and regtest.
- **account**: Account index (hardened).
- **change**: `0` for receiving addresses, `1` for change addresses.
- **index**: Address index within the chain.

### Quantum Paths

The quantum derivation path always uses purpose `360` (BIP360):

```
m/360'/<coin_type>'/<account>'/<change>/<index>
```

This ensures quantum keys are derived independently from classical keys while using the same account/index structure.

## Code Examples

### Generate a new wallet from a fresh mnemonic

```typescript
import { Mnemonic, MnemonicStrength } from '@btc-vision/transaction';
import { MLDSASecurityLevel } from '@btc-vision/bip32';
import { networks } from '@btc-vision/bitcoin';

// Generate a 24-word mnemonic
const mnemonic = Mnemonic.generate(
    MnemonicStrength.MAXIMUM,
    '',
    networks.bitcoin,
    MLDSASecurityLevel.LEVEL2,
);

// IMPORTANT: Save this phrase securely!
console.log('Mnemonic phrase:', mnemonic.phrase);

// Derive the first wallet
const wallet = mnemonic.derive(0);
console.log('Taproot address:', wallet.p2tr);
console.log('SegWit address:', wallet.p2wpkh);
console.log('Legacy address:', wallet.legacy);
```

### Restore a wallet from an existing mnemonic

```typescript
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const mnemonic = new Mnemonic(phrase, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonic.derive(0);

console.log('Restored address:', wallet.p2tr);
```

### Derive multiple wallets for an HD wallet UI

```typescript
const mnemonic = Mnemonic.generate();

// Derive 10 receiving wallets
const wallets = mnemonic.deriveMultiple(10, 0, 0, false, BIPStandard.BIP84);

for (let i = 0; i < wallets.length; i++) {
    console.log(`Wallet ${i}: ${wallets[i].p2wpkh}`);
}
```

### OPWallet-compatible derivation

```typescript
import { AddressTypes } from '@btc-vision/transaction';

const mnemonic = new Mnemonic(phrase, '', networks.bitcoin);

// Derive as OPWallet would for Taproot
const taprootWallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
console.log('OPWallet Taproot:', taprootWallet.p2tr);

// Derive multiple OPWallet-compatible wallets
const wallets = mnemonic.deriveMultipleUnisat(AddressTypes.P2TR, 5);
for (const w of wallets) {
    console.log(w.p2tr);
}
```

### Using a passphrase for additional security

```typescript
// Same mnemonic with different passphrases produces completely different wallets
const mnemonic1 = new Mnemonic(phrase, 'passphrase-A', networks.bitcoin);
const mnemonic2 = new Mnemonic(phrase, 'passphrase-B', networks.bitcoin);

const wallet1 = mnemonic1.derive(0);
const wallet2 = mnemonic2.derive(0);

console.log(wallet1.p2tr === wallet2.p2tr); // false -- different passphrases = different keys
```

### Secure disposal

```typescript
{
    using mnemonic = Mnemonic.generate();

    const wallet = mnemonic.derive(0);
    const address = wallet.p2tr;

    // ... use wallet for signing
} // mnemonic seed and root keys are zeroed automatically
```

### Custom derivation paths

```typescript
const mnemonic = new Mnemonic(phrase, '', networks.bitcoin);

const wallet = mnemonic.deriveCustomPath(
    "m/86'/0'/0'/0/0",   // Classical: BIP86 Taproot path
    "m/360'/0'/0'/0/0",  // Quantum: BIP360 path
);

console.log(wallet.p2tr);
```

## Best Practices

1. **Use `LEVEL2` (ML-DSA-44) as the default security level.** It provides sufficient quantum resistance with smaller key sizes. Only use `LEVEL3` or `LEVEL5` if your threat model specifically requires it.
2. **Use `MnemonicStrength.MAXIMUM` (24 words)** for production wallets. Shorter phrases are acceptable for testing but provide less entropy.
3. **Store mnemonic phrases securely.** The phrase is the single point of recovery for all derived wallets. Never store it in plaintext on disk or transmit it over insecure channels.
4. **Use passphrases for plausible deniability.** The same mnemonic with different passphrases produces entirely different key trees, providing a hidden wallet mechanism.
5. **Dispose of mnemonic instances** when no longer needed using `[Symbol.dispose]` or `zeroize()` to minimize seed material exposure in memory.
6. **Use `derive()` with `BIPStandard.BIP84`** as the default for new wallets. Use `deriveOPWallet()` only when compatibility with the OPWallet browser extension is needed.
7. **Validate phrases before construction** with `Mnemonic.validate()` to provide early user feedback rather than catching constructor errors.

## Related Documentation

- [Wallet](./wallet.md) -- Manages both classical and quantum-resistant keys
- [Address](./address.md) -- Quantum-resistant address representation
- [EcKeyPair](./ec-keypair.md) -- Classical ECDSA/Schnorr key pair utilities
- [AddressVerificator](./address-verificator.md) -- Address validation utilities
