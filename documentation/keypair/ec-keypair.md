# EcKeyPair

Provides static utility methods for working with classical ECDSA/Schnorr key pairs on Bitcoin. `EcKeyPair` handles key generation, derivation, address generation, Taproot tweaking, multi-signature address creation, and address verification. It uses the secp256k1 curve with precomputed tables for optimized performance.

This class is entirely static and is not meant to be instantiated.

## Table of Contents

- [Import](#import)
- [Key Pair Creation](#key-pair-creation)
  - [fromWIF()](#fromwif)
  - [fromPrivateKey()](#fromprivatekey)
  - [fromPublicKey()](#frompublickey)
  - [generateRandomKeyPair()](#generaterandomkeypair)
  - [fromSeed()](#fromseed)
  - [fromSeedKeyPair()](#fromseedkeypair)
- [Wallet Generation](#wallet-generation)
  - [generateWallet()](#generatewallet)
  - [generateQuantumKeyPair()](#generatequantumkeypair)
- [Address Generation](#address-generation)
  - [getTaprootAddress()](#gettaprootaddress)
  - [getP2WPKHAddress()](#getp2wpkhaddress)
  - [getLegacyAddress()](#getlegacyaddress)
  - [getLegacySegwitAddress()](#getlegacysegwitaddress)
  - [getP2PKH()](#getp2pkh)
  - [getP2PKAddress()](#getp2pkaddress)
  - [getTaprootAddressFromAddress()](#gettaprootaddressfromaddress)
  - [p2op()](#p2op)
  - [generateMultiSigAddress()](#generatemultisigaddress)
- [Public Key Operations](#public-key-operations)
  - [tweakPublicKey()](#tweakpublickey)
  - [tweakBatchSharedT()](#tweakbatchsharedt)
  - [tweakedPubKeyToAddress()](#tweakedpubkeytoaddress)
  - [tweakedPubKeyBufferToAddress()](#tweakedpubkeybuffertoaddress)
  - [xOnlyTweakedPubKeyToAddress()](#xonlytweakedpubkeytoaddress)
  - [verifyPubKeys()](#verifypubkeys)
- [Address Verification](#address-verification)
  - [verifyContractAddress()](#verifycontractaddress)
- [Static Properties](#static-properties)
- [Code Examples](#code-examples)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)

## Import

```typescript
import { EcKeyPair } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
```

## Key Pair Creation

### fromWIF()

```typescript
static fromWIF(wif: string, network?: Network): UniversalSigner
```

Creates a key pair from a Wallet Import Format (WIF) encoded private key.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `wif` | `string` | Yes | -- | The WIF-encoded private key string. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `UniversalSigner` -- a key pair capable of both ECDSA and Schnorr signing.

```typescript
const signer = EcKeyPair.fromWIF('L1a2b3c4d5...', networks.bitcoin);
console.log(signer.publicKey); // Uint8Array (33 bytes compressed)
```

### fromPrivateKey()

```typescript
static fromPrivateKey(privateKey: Uint8Array | PrivateKey, network?: Network): UniversalSigner
```

Creates a key pair from a raw private key.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `privateKey` | `Uint8Array \| PrivateKey` | Yes | -- | The 32-byte raw private key. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `UniversalSigner`

```typescript
import { fromHex } from '@btc-vision/bitcoin';

const privKey = fromHex('e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35');
const signer = EcKeyPair.fromPrivateKey(privKey, networks.testnet);
```

### fromPublicKey()

```typescript
static fromPublicKey(publicKey: Uint8Array | PublicKey, network?: Network): UniversalSigner
```

Creates a verification-only key pair from a public key. The resulting signer can verify signatures but cannot sign.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `publicKey` | `Uint8Array \| PublicKey` | Yes | -- | The 33-byte compressed public key. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `UniversalSigner`

### generateRandomKeyPair()

```typescript
static generateRandomKeyPair(network?: Network): UniversalSigner
```

Generates a cryptographically random key pair using secure random bytes.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `UniversalSigner`

```typescript
const randomSigner = EcKeyPair.generateRandomKeyPair(networks.bitcoin);
console.log(randomSigner.toWIF()); // WIF-encoded private key
```

### fromSeed()

```typescript
static fromSeed(seed: Uint8Array, network?: Network): BIP32Interface
```

Creates a BIP32 hierarchical deterministic key from a seed. The returned `BIP32Interface` supports path derivation.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `seed` | `Uint8Array` | Yes | -- | The seed bytes (typically 64 bytes from a mnemonic). |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `BIP32Interface`

### fromSeedKeyPair()

```typescript
static fromSeedKeyPair(seed: Uint8Array, network?: Network): UniversalSigner
```

Creates a `UniversalSigner` directly from a seed by deriving the root key pair.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `seed` | `Uint8Array` | Yes | -- | The seed bytes. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `UniversalSigner`

**Throws:** `Error` if the private key cannot be derived.

## Wallet Generation

### generateWallet()

```typescript
static generateWallet(network?: Network, securityLevel?: MLDSASecurityLevel): IWallet
```

Generates a complete random wallet with both classical (ECDSA) and quantum-resistant (ML-DSA) keys.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |
| `securityLevel` | `MLDSASecurityLevel` | No | `LEVEL2` | The ML-DSA security level for quantum keys. |

**Returns:** `IWallet`

```typescript
interface IWallet {
    readonly address: string;           // P2WPKH address
    readonly privateKey: string;        // WIF-encoded classical private key
    readonly publicKey: string;         // Hex-encoded classical public key
    readonly quantumPrivateKey: string; // Hex-encoded ML-DSA private key
    readonly quantumPublicKey: string;  // Hex-encoded ML-DSA public key
}
```

```typescript
const wallet = EcKeyPair.generateWallet(networks.bitcoin);
console.log(wallet.address);          // 'bc1q...'
console.log(wallet.publicKey);        // hex string
console.log(wallet.quantumPublicKey); // hex string (ML-DSA)
```

### generateQuantumKeyPair()

```typescript
static generateQuantumKeyPair(securityLevel?: MLDSASecurityLevel, network?: Network): MLDSAKeyPair
```

Generates a standalone quantum-resistant ML-DSA key pair without BIP32 derivation.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `securityLevel` | `MLDSASecurityLevel` | No | `LEVEL2` | The ML-DSA security level. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `MLDSAKeyPair` -- an object with `privateKey` and `publicKey` as `Uint8Array`.

## Address Generation

### getTaprootAddress()

```typescript
static getTaprootAddress(keyPair: UniversalSigner | Signer, network?: Network): string
```

Generates a Taproot (P2TR) address from a key pair using BIP86 derivation (internal pubkey only, no scripts).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyPair` | `UniversalSigner \| Signer` | Yes | -- | The key pair to derive the address from. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `string` -- a bech32m Taproot address (e.g., `bc1p...`).

```typescript
const signer = EcKeyPair.fromWIF('L1a2b3c4...', networks.bitcoin);
const taprootAddr = EcKeyPair.getTaprootAddress(signer, networks.bitcoin);
console.log(taprootAddr); // 'bc1p...'
```

### getP2WPKHAddress()

```typescript
static getP2WPKHAddress(keyPair: UniversalSigner | Signer, network?: Network): string
```

Generates a native SegWit (P2WPKH) address.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyPair` | `UniversalSigner \| Signer` | Yes | -- | The key pair. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `string` -- a bech32 SegWit address (e.g., `bc1q...`).

### getLegacyAddress()

```typescript
static getLegacyAddress(keyPair: UniversalSigner, network?: Network): string
```

Generates a legacy (P2PKH) address.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyPair` | `UniversalSigner` | Yes | -- | The key pair. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `string` -- a legacy address (e.g., `1...`).

### getLegacySegwitAddress()

```typescript
static getLegacySegwitAddress(keyPair: UniversalSigner, network?: Network): string
```

Generates a nested SegWit (P2SH-P2WPKH) address.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyPair` | `UniversalSigner` | Yes | -- | The key pair. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `string` -- a nested SegWit address (e.g., `3...`).

### getP2PKH()

```typescript
static getP2PKH(publicKey: PublicKey, network?: Network): string
```

Generates a P2PKH address directly from a public key without requiring a full signer.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `publicKey` | `PublicKey` | Yes | -- | The 33-byte compressed public key. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `string`

### getP2PKAddress()

```typescript
static getP2PKAddress(keyPair: UniversalSigner, network?: Network): string
```

Gets the P2PK (Pay-to-Public-Key) output script as a `0x`-prefixed hex string. Note that P2PK outputs do not have a standard address format; this returns the raw output script.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyPair` | `UniversalSigner` | Yes | -- | The key pair. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `string` -- `0x`-prefixed hex of the output script.

### getTaprootAddressFromAddress()

```typescript
static getTaprootAddressFromAddress(inAddr: string, network?: Network): string
```

Converts an existing address string to a Taproot address.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inAddr` | `string` | Yes | -- | The input address. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `string` -- a Taproot address.

### p2op()

```typescript
static p2op(bytes: Uint8Array, network?: Network, deploymentVersion?: number): string
```

Generates a P2OP (Pay-to-OPNet) address using witness version 16 and a hash160 of the input bytes.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `bytes` | `Uint8Array` | Yes | -- | The bytes to hash for the witness program (typically the ML-DSA hash). |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |
| `deploymentVersion` | `number` | No | `0` | The OPNet deployment version byte. |

**Returns:** `string` -- a bech32m P2OP address.

### generateMultiSigAddress()

```typescript
static generateMultiSigAddress(
    pubKeys: Uint8Array[] | PublicKey[],
    minimumSignatureRequired: number,
    network?: Network,
): string
```

Generates an M-of-N multi-signature P2WSH address from a set of public keys.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pubKeys` | `Uint8Array[] \| PublicKey[]` | Yes | -- | Array of compressed public keys (33 bytes each). |
| `minimumSignatureRequired` | `number` | Yes | -- | The minimum number of signatures required to spend (M in M-of-N). |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `string` -- a P2WSH multi-sig address (e.g., `bc1q...`).

**Throws:** `Error` if any public key is invalid or if address generation fails.

```typescript
const multiSigAddr = EcKeyPair.generateMultiSigAddress(
    [pubKeyA, pubKeyB, pubKeyC],
    2,  // 2-of-3
    networks.bitcoin,
);
console.log(multiSigAddr); // 'bc1q...' (P2WSH)
```

## Public Key Operations

### tweakPublicKey()

```typescript
static tweakPublicKey(pub: Uint8Array | string): Uint8Array
```

Applies BIP340 Taproot tweaking to a public key. This performs the standard `TapTweak` hash-based tweak: the public key is first normalized to even Y, then a tweak scalar is derived from `SHA256(SHA256("TapTweak") || SHA256("TapTweak") || x)` and applied to the point.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pub` | `Uint8Array \| string` | Yes | The public key to tweak. Accepts 33-byte compressed, or a hex string (with optional `0x` prefix). |

**Returns:** `Uint8Array` -- the 33-byte compressed tweaked public key.

```typescript
const tweaked = EcKeyPair.tweakPublicKey(signer.publicKey);
// tweaked is 33 bytes: [prefix, x0, x1, ..., x31]
```

### tweakBatchSharedT()

```typescript
static tweakBatchSharedT(pubkeys: readonly Uint8Array[], tweakScalar: bigint): Uint8Array[]
```

Tweaks multiple public keys with the same scalar. More efficient than tweaking individually when the same tweak scalar is shared across keys.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pubkeys` | `readonly Uint8Array[]` | Yes | Array of public keys to tweak. |
| `tweakScalar` | `bigint` | Yes | The scalar value for tweaking. |

**Returns:** `Uint8Array[]` -- array of 33-byte compressed tweaked public keys.

### tweakedPubKeyToAddress()

```typescript
static tweakedPubKeyToAddress(tweakedPubKeyHex: string, network: Network): string
```

Converts a tweaked public key hex string to a Taproot address. Handles both 32-byte x-only and 33-byte compressed inputs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweakedPubKeyHex` | `string` | Yes | The tweaked public key in hex (with optional `0x` prefix). |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string` -- a Taproot address.

### tweakedPubKeyBufferToAddress()

```typescript
static tweakedPubKeyBufferToAddress(tweakedPubKeyBuffer: XOnlyPublicKey, network: Network): string
```

Converts a 32-byte x-only tweaked public key buffer to a Taproot address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweakedPubKeyBuffer` | `XOnlyPublicKey` | Yes | The 32-byte x-only tweaked public key. |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string` -- a Taproot address.

### xOnlyTweakedPubKeyToAddress()

```typescript
static xOnlyTweakedPubKeyToAddress(tweakedPubKeyHex: string, network: Network): string
```

Converts a strictly 32-byte x-only tweaked public key hex string to a Taproot address. Unlike `tweakedPubKeyToAddress()`, this throws if the key is not exactly 32 bytes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweakedPubKeyHex` | `string` | Yes | The 32-byte x-only tweaked public key in hex. |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string`

**Throws:** `Error` if the key is not exactly 32 bytes.

### verifyPubKeys()

```typescript
static verifyPubKeys(pubKeys: Uint8Array[], network?: Network): Uint8Array[]
```

Validates an array of public keys by attempting to create key pairs from each one. Returns the verified public key buffers.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pubKeys` | `Uint8Array[]` | Yes | -- | Array of public keys to verify. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `Uint8Array[]` -- array of verified public key buffers.

**Throws:** `Error` if any key fails verification.

## Address Verification

### verifyContractAddress()

```typescript
static verifyContractAddress(contractAddress: string, network?: Network): boolean
```

Verifies that a contract address string can be converted to a valid output script on the given network.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `contractAddress` | `string` | Yes | -- | The address to verify. |
| `network` | `Network` | No | `networks.bitcoin` | The Bitcoin network. |

**Returns:** `boolean` -- `true` if the address produces a valid output script.

```typescript
const isValid = EcKeyPair.verifyContractAddress('bc1p...', networks.bitcoin);
console.log(isValid); // true
```

## Static Properties

| Property | Type | Description |
|----------|------|-------------|
| `BIP32` | `BIP32API` | The BIP32 factory instance, initialized with the secp256k1 backend. |
| `ECPairSigner` | `typeof ECPairSigner` | Reference to the `ECPairSigner` class for direct access. |

## Code Examples

### Full workflow: generate key pair, derive addresses

```typescript
import { EcKeyPair } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const network = networks.bitcoin;

// Generate a random key pair
const signer = EcKeyPair.generateRandomKeyPair(network);

// Derive all address types
const taproot = EcKeyPair.getTaprootAddress(signer, network);
const segwit  = EcKeyPair.getP2WPKHAddress(signer, network);
const legacy  = EcKeyPair.getLegacyAddress(signer, network);
const nested  = EcKeyPair.getLegacySegwitAddress(signer, network);

console.log('Taproot:', taproot);  // bc1p...
console.log('SegWit:', segwit);    // bc1q...
console.log('Legacy:', legacy);    // 1...
console.log('Nested:', nested);    // 3...
```

### Create a 2-of-3 multisig

```typescript
const addr = EcKeyPair.generateMultiSigAddress(
    [pubkey1, pubkey2, pubkey3],
    2,
    networks.bitcoin,
);
console.log('Multisig address:', addr); // bc1q... (P2WSH)
```

### Import from WIF and generate a complete wallet

```typescript
const signer = EcKeyPair.fromWIF('L4rK1yDt...', networks.bitcoin);
const wallet = EcKeyPair.generateWallet(networks.bitcoin);

console.log('Classical address:', wallet.address);
console.log('Quantum public key:', wallet.quantumPublicKey);
```

## Best Practices

1. **Always specify the network** to avoid accidentally using mainnet keys on testnet or vice versa.
2. **Use `fromWIF()` for persistent keys** and `generateRandomKeyPair()` only for ephemeral use cases.
3. **Use `generateWallet()` for new wallets** as it produces both classical and quantum keys together.
4. **Verify public keys before multi-sig** using `verifyPubKeys()` to ensure all participants' keys are valid.
5. **Prefer Taproot addresses** (`getTaprootAddress()`) for new applications due to their superior privacy and efficiency.

## Related Documentation

- [Address](./address.md) -- Quantum-resistant address representation
- [Wallet](./wallet.md) -- Manages both classical and quantum-resistant keys
- [AddressVerificator](./address-verificator.md) -- Address validation utilities
- [Mnemonic](./mnemonic.md) -- BIP39 + BIP360 quantum wallet derivation
