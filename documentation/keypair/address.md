# Address

Represents a quantum-resistant address in OPNet's hybrid cryptographic architecture. An `Address` internally stores the SHA256 hash of an ML-DSA (quantum) public key as its primary 32-byte content and maintains a classical Bitcoin tweaked public key separately. This dual-key design enables quantum-resistant addressing while preserving full compatibility with traditional Bitcoin address formats (P2TR, P2WPKH, P2PKH, P2SH-P2WPKH, P2WDA, and P2OP).

The `Address` class extends `Uint8Array` (always 32 bytes) and implements `Disposable` for secure memory cleanup.

## Table of Contents

- [Import](#import)
- [Critical Warning](#critical-warning)
- [Constructor](#constructor)
- [Static Methods](#static-methods)
  - [Address.fromString()](#addressfromstring)
  - [Address.dead()](#addressdead)
  - [Address.wrap()](#addresswrap)
  - [Address.fromBigInt()](#addressfrombigint)
  - [Address.fromUint64Array()](#addressfromuint64array)
  - [Address.uncompressedToCompressed()](#addressuncompressedtocompressed)
- [Instance Methods](#instance-methods)
  - [toHex()](#tohex)
  - [tweakedToHex()](#tweakedtohex)
  - [toBuffer()](#tobuffer)
  - [originalPublicKeyBuffer()](#originalpublickeybuffer)
  - [tweakedPublicKeyToBuffer()](#tweakedpublickeytobuffer)
  - [toUncompressedHex()](#touncompressedhex)
  - [toUncompressedBuffer()](#touncompressedbuffer)
  - [toHybridPublicKeyHex()](#tohybridpublickeyhex)
  - [toHybridPublicKeyBuffer()](#tohybridpublickeybuffer)
  - [toTweakedHybridPublicKeyHex()](#totweakedhybridpublickeyhex)
  - [toTweakedHybridPublicKeyBuffer()](#totweakedhybridpublickeybuffer)
  - [p2tr()](#p2tr)
  - [p2wpkh()](#p2wpkh)
  - [p2pkh()](#p2pkh)
  - [p2shp2wpkh()](#p2shp2wpkh)
  - [p2wda()](#p2wda)
  - [p2op()](#p2op)
  - [p2pk()](#p2pk)
  - [set()](#set)
  - [equals()](#equals)
  - [lessThan() / greaterThan()](#lessthan--greaterthan)
  - [toBigInt()](#tobigint)
  - [tweakedToBigInt()](#tweakedtobigint)
  - [toUint64Array()](#touint64array)
  - [isDead()](#isdead)
  - [isValidLegacyPublicKey()](#isvalidlegacypublickey)
  - [toString()](#tostring)
  - [toJSON()](#tojson)
  - [toCSV()](#tocsv)
  - [toCSVTweaked()](#tocsvtweaked)
  - [toCSVP2MR()](#tocsvp2mr)
  - [\[Symbol.dispose\]()](#symboldispose)
- [Properties](#properties)
- [Lazy Loading Architecture](#lazy-loading-architecture)
- [Code Examples](#code-examples)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)

## Import

```typescript
import { Address } from '@btc-vision/transaction';
```

## Critical Warning

> **`Address.fromString()` does NOT accept bech32 addresses.** You cannot pass `bc1q...` or `bc1p...` strings to this method. It requires two hexadecimal public key parameters: the first is the 32-byte SHA256 hash of the ML-DSA public key, and the second is the 33-byte (or 65-byte) Bitcoin compressed (or uncompressed) public key. Both must be `0x`-prefixed hex strings.
>
> If you have a bech32 address and need to create an `Address` object, you must first resolve it to its public keys using a provider (e.g., `await provider.getPublicKeyInfo("bc1q...")`).

## Constructor

```typescript
new Address(mldsaPublicKey?: ArrayLike<number>, publicKeyOrTweak?: ArrayLike<number>)
```

Creates a new Address instance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mldsaPublicKey` | `ArrayLike<number>` | No | Either a 32-byte SHA256 hash of the ML-DSA public key, or the raw ML-DSA public key (1312, 1952, or 2592 bytes). If raw, it will be hashed with SHA256 automatically. |
| `publicKeyOrTweak` | `ArrayLike<number>` | No | The classical Bitcoin public key. Accepts 32-byte x-only, 33-byte compressed, or 65-byte uncompressed formats. Expensive EC operations are deferred until needed. |

If `mldsaPublicKey` is omitted, a zeroed 32-byte address is created. If the raw ML-DSA public key is provided (not the hash), the class stores the original and computes the SHA256 hash internally.

**Throws:**
- `Error` if `publicKeyOrTweak` has an invalid length (not 32, 33, or 65 bytes).
- `Error` if `mldsaPublicKey` is not 32 bytes and not a valid ML-DSA public key length (1312, 1952, or 2592 bytes).

## Static Methods

### Address.fromString()

```typescript
static fromString(mldsaPublicKey: string, legacyPublicKey?: string): Address
```

Creates an Address from hex-encoded public key strings. This is the primary factory method for constructing addresses from string representations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mldsaPublicKey` | `string` | Yes | The 32-byte SHA256 hash of the ML-DSA public key in hex format. `0x` prefix is optional. |
| `legacyPublicKey` | `string` | No | The classical Bitcoin public key in hex format (33 bytes compressed or 65 bytes uncompressed). `0x` prefix is optional. |

**Returns:** `Address`

**Throws:** `Error` if either parameter is not valid hexadecimal. The error message explicitly states that bech32 addresses are not accepted.

> **WARNING:** This method takes hex-encoded public keys, NOT bech32 addresses. Passing `bc1q...` or `bc1p...` will throw an error. If you only have an address string, resolve it to a public key first via `provider.getPublicKeyInfo()`.

```typescript
// Correct usage with two hex public keys
const address = Address.fromString(
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    '0x020373626d317ae8788ce3280b491068610d840c23ecb64c14075bbb9f670af52c',
);

// WRONG - this will throw an error
const bad = Address.fromString('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
```

### Address.dead()

```typescript
static dead(): Address
```

Returns a dead/burn address. The ML-DSA hash is all zeros and the classical key is the Bitcoin genesis block coinbase public key. Useful as a placeholder or for burning tokens.

**Returns:** `Address` -- a dead address with a zeroed ML-DSA hash.

```typescript
const burnAddress = Address.dead();
console.log(burnAddress.isDead()); // true
```

### Address.wrap()

```typescript
static wrap(bytes: ArrayLike<number>): Address
```

Creates an Address from raw bytes, treating them as the ML-DSA public key (or its hash). No classical public key is set.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bytes` | `ArrayLike<number>` | Yes | The raw bytes to use as the ML-DSA key portion. |

**Returns:** `Address`

### Address.fromBigInt()

```typescript
static fromBigInt(value: bigint, tweakedValue?: bigint): Address
```

Creates an Address from a 256-bit unsigned integer. The inverse of `toBigInt()`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | `bigint` | Yes | The 256-bit unsigned integer representing the ML-DSA hash (0 to 2^256-1). |
| `tweakedValue` | `bigint` | No | Optional tweaked public key as a 256-bit unsigned integer. |

**Returns:** `Address`

```typescript
const addr = Address.fromBigInt(12345678901234567890n);
console.log(addr.toBigInt()); // 12345678901234567890n
```

### Address.fromUint64Array()

```typescript
static fromUint64Array(w0: bigint, w1: bigint, w2: bigint, w3: bigint): Address
```

Creates an Address from four 64-bit big-endian unsigned integers. The inverse of `toUint64Array()`. Useful for efficient serialization or interfacing with word-aligned storage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `w0` | `bigint` | Yes | Most significant 64 bits (bytes 0-7). |
| `w1` | `bigint` | Yes | Second 64 bits (bytes 8-15). |
| `w2` | `bigint` | Yes | Third 64 bits (bytes 16-23). |
| `w3` | `bigint` | Yes | Least significant 64 bits (bytes 24-31). |

**Returns:** `Address`

### Address.uncompressedToCompressed()

```typescript
static uncompressedToCompressed(publicKey: ArrayLike<number>): Uint8Array
```

Converts a 65-byte uncompressed public key to a 33-byte compressed public key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `publicKey` | `ArrayLike<number>` | Yes | The 65-byte uncompressed public key (starting with `0x04`). |

**Returns:** `Uint8Array` -- the 33-byte compressed public key.

## Instance Methods

### toHex()

```typescript
toHex(): string
```

Returns the SHA256 hash of the ML-DSA public key as a `0x`-prefixed hex string. This 32-byte value is the universal OPNet identifier for the address.

**Returns:** `string` -- `0x`-prefixed 64-character hex string.

```typescript
const address = Address.fromString('0xabcd...', '0x02...');
console.log(address.toHex()); // '0xabcd...'
```

### tweakedToHex()

```typescript
tweakedToHex(): string
```

Returns the classical tweaked x-only public key as a `0x`-prefixed hex string.

**Returns:** `string`

**Throws:** `Error` if the legacy public key was not set.

### toBuffer()

```typescript
toBuffer(): MLDSAHashedPublicKey
```

Returns the address content (SHA256 hash of the ML-DSA public key) as a new `Uint8Array`.

**Returns:** `Uint8Array` (branded as `MLDSAHashedPublicKey`)

### originalPublicKeyBuffer()

```typescript
originalPublicKeyBuffer(): PublicKey
```

Returns the original compressed classical public key (33 bytes) as a new `Uint8Array`. This is a copy of the key that was provided to the constructor.

**Returns:** `Uint8Array` (branded as `PublicKey`) -- the 33-byte compressed public key.

**Throws:** `Error` if the legacy public key was not set.

### tweakedPublicKeyToBuffer()

```typescript
tweakedPublicKeyToBuffer(): XOnlyPublicKey
```

Returns the classical tweaked x-only public key (32 bytes) as a new `Uint8Array`.

**Returns:** `Uint8Array` (branded as `XOnlyPublicKey`)

**Throws:** `Error` if the legacy public key was not set.

### toUncompressedHex()

```typescript
toUncompressedHex(): string
```

Returns the uncompressed classical public key (65 bytes, starting with `0x04`) as a `0x`-prefixed hex string.

**Returns:** `string`

**Throws:** `Error` if the legacy public key was not set.

### toUncompressedBuffer()

```typescript
toUncompressedBuffer(): PublicKey
```

Returns the uncompressed classical public key (65 bytes) as a `Uint8Array`.

**Returns:** `Uint8Array` (branded as `PublicKey`)

**Throws:** `Error` if the legacy public key was not set.

### toHybridPublicKeyHex()

```typescript
toHybridPublicKeyHex(): string
```

Returns the hybrid public key (derived from decompressing the classical public key) as a `0x`-prefixed hex string.

**Returns:** `string`

**Throws:** `Error` if the legacy public key was not set.

### toHybridPublicKeyBuffer()

```typescript
toHybridPublicKeyBuffer(): HybridPublicKey
```

Returns the hybrid public key as a `Uint8Array`.

**Returns:** `Uint8Array` (branded as `HybridPublicKey`)

**Throws:** `Error` if the legacy public key was not set.

### toTweakedHybridPublicKeyHex()

```typescript
toTweakedHybridPublicKeyHex(): string
```

Returns the tweaked hybrid public key (derived from the Taproot-tweaked classical public key) as a `0x`-prefixed hex string.

**Returns:** `string`

**Throws:** `Error` if the legacy public key was not set.

### toTweakedHybridPublicKeyBuffer()

```typescript
toTweakedHybridPublicKeyBuffer(): Uint8Array
```

Returns the tweaked hybrid public key as a `Uint8Array`.

**Returns:** `Uint8Array`

**Throws:** `Error` if the legacy public key was not set.

### p2tr()

```typescript
p2tr(network: Network): string
```

Returns the Taproot (P2TR) address derived from the classical tweaked public key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | `Network` | Yes | The Bitcoin network (`networks.bitcoin`, `networks.testnet`, or `networks.regtest`). |

**Returns:** `string` -- a bech32m Taproot address (e.g., `bc1p...`).

**Throws:** `Error` if the legacy public key was not set.

```typescript
import { networks } from '@btc-vision/bitcoin';

const taprootAddr = address.p2tr(networks.bitcoin);
console.log(taprootAddr); // 'bc1p...'
```

### p2wpkh()

```typescript
p2wpkh(network: Network): string
```

Returns the native SegWit (P2WPKH) address derived from the classical public key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string` -- a bech32 SegWit address (e.g., `bc1q...`).

### p2pkh()

```typescript
p2pkh(network: Network): string
```

Returns the legacy (P2PKH) address derived from the classical public key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string` -- a legacy address (e.g., `1...`).

### p2shp2wpkh()

```typescript
p2shp2wpkh(network: Network): string
```

Returns the nested SegWit (P2SH-P2WPKH) address derived from the classical public key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string` -- a nested SegWit address (e.g., `3...`).

### p2wda()

```typescript
p2wda(network: Network): IP2WSHAddress
```

Generates a Pay-to-Witness-Data-Authentication (P2WDA) address. P2WDA addresses are special P2WSH addresses that embed authenticated data in the witness field, achieving 75% cost reduction through the SegWit witness discount.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `IP2WSHAddress` -- an object containing `address` (the P2WSH address string) and `witnessScript` (the serialized witness script).

**Throws:** `Error` if the public key is not set or if generation fails.

```typescript
const p2wdaInfo = address.p2wda(networks.bitcoin);
console.log(p2wdaInfo.address);       // 'bc1q...' (P2WSH format)
console.log(p2wdaInfo.witnessScript); // Uint8Array of witness script
```

### p2op()

```typescript
p2op(network: Network): string
```

Returns the P2OP (Pay-to-OPNet) address encoded in bech32m format with witness version 16. This address is derived from the ML-DSA hash only and does not require the classical public key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string` -- a bech32m P2OP address.

### p2pk()

```typescript
p2pk(): string
```

Returns the hex-encoded ML-DSA hash (equivalent to `toHex()`). This is the public-key representation used for Pay-to-Public-Key style outputs.

**Returns:** `string`

### set()

```typescript
override set(mldsaPublicKey: ArrayLike<number>): void
```

Overrides `Uint8Array.set()` to set the ML-DSA public key content. If the provided bytes are a raw ML-DSA public key (1312, 1952, or 2592 bytes), it will be hashed with SHA256 and the hash stored. If it is already 32 bytes, it is stored directly.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mldsaPublicKey` | `ArrayLike<number>` | Yes | The ML-DSA public key (raw or hashed). |

### equals()

```typescript
equals(other: Address): boolean
```

Compares two addresses byte-by-byte for equality. Comparison is based on the ML-DSA hash content only (the 32-byte `Uint8Array` content).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `other` | `Address` | Yes | The address to compare against. |

**Returns:** `boolean`

```typescript
const a = Address.fromString('0xabcd...', '0x02...');
const b = Address.fromString('0xabcd...', '0x03...');
console.log(a.equals(b)); // true (same ML-DSA hash)
```

### lessThan() / greaterThan()

```typescript
lessThan(other: Address): boolean
greaterThan(other: Address): boolean
```

Byte-by-byte comparison of two addresses, treating them as big-endian 256-bit unsigned integers. Useful for sorting or ordering addresses.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `other` | `Address` | Yes | The address to compare against. |

**Returns:** `boolean`

### toBigInt()

```typescript
toBigInt(): bigint
```

Converts the 32-byte ML-DSA hash to a single `bigint` value. Uses an optimized DataView approach (10-20x faster than string conversion). The result is cached after the first call.

**Returns:** `bigint` -- 256-bit unsigned integer.

### tweakedToBigInt()

```typescript
tweakedToBigInt(): bigint
```

Converts the 32-byte tweaked classical public key to a single `bigint` value. Cached after the first call.

**Returns:** `bigint`

**Throws:** `Error` if the legacy public key was not set.

### toUint64Array()

```typescript
toUint64Array(): [bigint, bigint, bigint, bigint]
```

Splits the 32-byte address into four 64-bit big-endian unsigned integers. The result is cached.

**Returns:** `[bigint, bigint, bigint, bigint]` -- `[w0, w1, w2, w3]` from most significant to least significant.

### isDead()

```typescript
isDead(): boolean
```

Returns `true` if every byte of the ML-DSA hash is zero (i.e., the dead/burn address).

**Returns:** `boolean`

### isValidLegacyPublicKey()

```typescript
isValidLegacyPublicKey(network: Network): boolean
```

Validates the classical public key against the given network.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `boolean`

**Throws:** `Error` if the legacy key was not set.

### toString()

```typescript
toString(): string
```

Returns the `0x`-prefixed hex string of the ML-DSA hash. Equivalent to `toHex()`.

**Returns:** `string`

### toJSON()

```typescript
toJSON(): string
```

Returns the `0x`-prefixed hex string of the ML-DSA hash. Used for JSON serialization.

**Returns:** `string`

### toCSV()

```typescript
toCSV(duration: bigint | number | string, network: Network): IP2WSHAddress
```

Generates a P2WSH address with a CheckSequenceVerify (CSV) time lock. The resulting address can only be spent after the specified number of blocks.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `duration` | `bigint \| number \| string` | Yes | Number of blocks before spending is allowed (1-65535). |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `IP2WSHAddress` -- the time-locked address and its witness script.

**Throws:** `Error` if the duration is out of range or the public key is not set.

### toCSVTweaked()

```typescript
toCSVTweaked(duration: bigint | number | string, network: Network): string
```

Generates a P2TR address with a CSV time lock using the tweaked public key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `duration` | `bigint \| number \| string` | Yes | Number of blocks before spending is allowed (1-65535). |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string` -- the time-locked Taproot address.

### toCSVP2MR()

```typescript
toCSVP2MR(duration: bigint | number | string, network: Network): string
```

Generates a P2MR address with a CSV time lock using the tweaked public key. P2MR (BIP 360) commits directly to a Merkle root without an internal public key, providing quantum resistance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `duration` | `bigint \| number \| string` | Yes | Number of blocks before spending is allowed (1-65535). |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `string` -- the time-locked P2MR address (e.g., `bc1z...`).

**Throws:** `Error` if the duration is out of range or the public key is not set.

```typescript
const csvP2MR = address.toCSVP2MR(144, networks.bitcoin);
// Returns a bc1z... address with a 144-block CSV timelock
```

### \[Symbol.dispose\]()

```typescript
[Symbol.dispose](): void
```

Securely disposes the address by zeroing all internal buffers and clearing cached state. Use this when you are done with the address to minimize secret material exposure.

```typescript
{
    using address = new Address(mldsaKey, classicalKey);
    // ... use address
} // automatically disposed here
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `originalPublicKey` | `PublicKey \| undefined` | The original compressed classical public key (33 bytes), if set. Triggers lazy legacy processing. |
| `mldsaPublicKey` | `MLDSAHashedPublicKey \| undefined` | The original (unhashed) ML-DSA public key, if the raw key was provided to the constructor. |
| `originalMDLSAPublicKey` | `Uint8Array \| undefined` | Get/set the original ML-DSA public key bytes. |
| `mldsaLevel` | `MLDSASecurityLevel \| undefined` | Get/set the ML-DSA security level associated with this address. |

## Lazy Loading Architecture

The `Address` class uses lazy evaluation for expensive EC operations. When a classical public key is provided, it is stored but not processed until a method that requires it is called (e.g., `p2tr()`, `p2wpkh()`, `tweakedPublicKeyToBuffer()`). This means:

- Creating an `Address` with both keys is cheap (no EC math at construction time).
- Methods that only use the ML-DSA hash (e.g., `toHex()`, `p2op()`, `toBigInt()`) never trigger legacy key processing.
- The first call to a method requiring the classical key triggers the deferred processing. Subsequent calls use cached results.

This design is critical for performance in hot paths like block parsing, where thousands of addresses may be created but only a fraction require classical key operations.

## Code Examples

### Creating an address from hex public keys

```typescript
import { Address } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const address = Address.fromString(
    '0x9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
    '0x020373626d317ae8788ce3280b491068610d840c23ecb64c14075bbb9f670af52c',
);

// Get various address formats
console.log(address.toHex());                    // ML-DSA hash (universal ID)
console.log(address.p2tr(networks.bitcoin));     // bc1p...
console.log(address.p2wpkh(networks.bitcoin));   // bc1q...
console.log(address.p2pkh(networks.bitcoin));    // 1...
console.log(address.p2shp2wpkh(networks.bitcoin)); // 3...
console.log(address.p2op(networks.bitcoin));     // bech32m P2OP
```

### Comparing addresses

```typescript
const addr1 = Address.fromString('0xaabb...', '0x02...');
const addr2 = Address.fromString('0xaabb...', '0x03...');
const addr3 = Address.fromString('0xccdd...', '0x02...');

console.log(addr1.equals(addr2)); // true  (same ML-DSA hash)
console.log(addr1.equals(addr3)); // false (different ML-DSA hash)
```

### Using the burn address

```typescript
const burnAddress = Address.dead();
console.log(burnAddress.isDead());  // true
console.log(burnAddress.toHex());   // '0x0000...0000'
```

### Secure disposal

```typescript
{
    using address = Address.fromString('0x...', '0x...');
    const taproot = address.p2tr(networks.bitcoin);
    // ... use address
} // address is securely zeroed when it goes out of scope
```

## Best Practices

1. **Never pass bech32 addresses to `fromString()`.** Always use hex-encoded public keys. If you only have a bech32 address, resolve it to public keys through a provider first.
2. **Use `[Symbol.dispose]`** (or call `dispose()` manually) to zero sensitive key material when addresses are no longer needed.
3. **Prefer `p2op()` for OPNet-specific identifiers** since it only requires the ML-DSA hash and avoids triggering expensive classical key processing.
4. **Cache results from `toBigInt()` and `toUint64Array()`** -- they are already internally cached, so repeated calls are free.
5. **For address comparison, use `equals()`** rather than comparing hex strings for better performance.

## Related Documentation

- [EcKeyPair](./ec-keypair.md) -- Classical ECDSA/Schnorr key pair utilities
- [Wallet](./wallet.md) -- Manages both classical and quantum-resistant keys
- [AddressVerificator](./address-verificator.md) -- Address validation utilities
- [Mnemonic](./mnemonic.md) -- BIP39 + BIP360 quantum wallet derivation
- [P2WDA Addresses](../addresses/P2WDA.md) -- Pay-to-Witness-Data-Authentication
