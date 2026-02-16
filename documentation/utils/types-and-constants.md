# Types and Constants

Type aliases and byte length constants used throughout the OPNet codebase.

## Overview

The OPNet transaction library defines a set of numeric type aliases that mirror common integer types found in systems programming, plus byte length constants used for binary serialization and deserialization. These types and constants ensure consistency across the codebase and make it clear when a value represents a specific fixed-width integer.

**Sources:**
- `src/utils/types.ts` -- Type aliases
- `src/utils/lengths.ts` -- Byte length constants

## Table of Contents

- [Import](#import)
- [Numeric Type Aliases](#numeric-type-aliases)
  - [Unsigned Integer Types](#unsigned-integer-types)
  - [Signed Integer Types](#signed-integer-types)
  - [Special Types](#special-types)
- [Byte Length Constants](#byte-length-constants)
  - [Unsigned Integer Lengths](#unsigned-integer-lengths)
  - [Signed Integer Lengths](#signed-integer-lengths)
  - [Address and Signature Lengths](#address-and-signature-lengths)
  - [Other Lengths](#other-lengths)
- [Storage Types](#storage-types)
- [Complete Reference Table](#complete-reference-table)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Import

```typescript
import type { u8, u16, u32, u64, i8, i16, i32, i64, Selector, BufferLike } from '@btc-vision/transaction';

import {
    U8_BYTE_LENGTH,
    U16_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    U128_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    ADDRESS_BYTE_LENGTH,
    EXTENDED_ADDRESS_BYTE_LENGTH,
    SCHNORR_SIGNATURE_BYTE_LENGTH,
    SELECTOR_BYTE_LENGTH,
} from '@btc-vision/transaction';
```

---

## Numeric Type Aliases

### Unsigned Integer Types

| Type Alias | TypeScript Type | Size | Value Range |
|-----------|----------------|------|-------------|
| `u8` | `number` | 1 byte | 0 to 255 |
| `u16` | `number` | 2 bytes | 0 to 65,535 |
| `u32` | `number` | 4 bytes | 0 to 4,294,967,295 |
| `u64` | `bigint` | 8 bytes | 0 to 2^64 - 1 |

```typescript
type u8 = number;
type u16 = number;
type u32 = number;
type u64 = bigint;
```

> **Note:** `u8`, `u16`, and `u32` map to `number` because JavaScript `number` can exactly represent all values in those ranges. `u64` maps to `bigint` because `number` cannot exactly represent all 64-bit unsigned integers (JavaScript `number` is a 64-bit float with 53 bits of integer precision).

### Signed Integer Types

| Type Alias | TypeScript Type | Size | Value Range |
|-----------|----------------|------|-------------|
| `i8` | `number` | 1 byte | -128 to 127 |
| `i16` | `number` | 2 bytes | -32,768 to 32,767 |
| `i32` | `number` | 4 bytes | -2,147,483,648 to 2,147,483,647 |
| `i64` | `bigint` | 8 bytes | -2^63 to 2^63 - 1 |

```typescript
type i8 = number;
type i16 = number;
type i32 = number;
type i64 = bigint;
```

### Special Types

| Type Alias | TypeScript Type | Size | Description |
|-----------|----------------|------|-------------|
| `Selector` | `number` | 4 bytes | A function selector (first 4 bytes of the SHA-256 hash of the function signature). Equivalent to `u32`. |
| `BufferLike` | `Uint8Array` | Variable | Alias for `Uint8Array`. Used in API signatures to indicate any binary data. |
| `MemorySlotPointer` | `bigint` | 32 bytes | A 256-bit unsigned integer representing a storage slot address in the OPNet virtual machine. |

```typescript
type Selector = number;
type BufferLike = Uint8Array;
type MemorySlotPointer = bigint;
```

---

## Byte Length Constants

### Unsigned Integer Lengths

| Constant | Value | Description |
|----------|-------|-------------|
| `U8_BYTE_LENGTH` | `1` | Bytes for a `u8` value. |
| `U16_BYTE_LENGTH` | `2` | Bytes for a `u16` value. |
| `U32_BYTE_LENGTH` | `4` | Bytes for a `u32` value. |
| `U64_BYTE_LENGTH` | `8` | Bytes for a `u64` value. |
| `U128_BYTE_LENGTH` | `16` | Bytes for a `u128` value. |
| `U256_BYTE_LENGTH` | `32` | Bytes for a `u256` value. This is the standard OPNet storage slot size. |

### Signed Integer Lengths

| Constant | Value | Description |
|----------|-------|-------------|
| `I8_BYTE_LENGTH` | `1` | Bytes for an `i8` value. |
| `I16_BYTE_LENGTH` | `2` | Bytes for an `i16` value. |
| `I32_BYTE_LENGTH` | `4` | Bytes for an `i32` value. |
| `I64_BYTE_LENGTH` | `8` | Bytes for an `i64` value. |
| `I128_BYTE_LENGTH` | `16` | Bytes for an `i128` value. |
| `I256_BYTE_LENGTH` | `32` | Bytes for an `i256` value. |

### Address and Signature Lengths

| Constant | Value | Description |
|----------|-------|-------------|
| `ADDRESS_BYTE_LENGTH` | `32` | Standard OPNet address size (SHA-256 hash of ML-DSA public key). |
| `EXTENDED_ADDRESS_BYTE_LENGTH` | `64` | Extended address size (32-byte tweaked public key + 32-byte ML-DSA hash). |
| `SCHNORR_SIGNATURE_BYTE_LENGTH` | `64` | Size of a Schnorr signature. |
| `SELECTOR_BYTE_LENGTH` | `4` | Size of a function selector. |

### Other Lengths

| Constant | Value | Description |
|----------|-------|-------------|
| `BOOLEAN_BYTE_LENGTH` | `1` | Bytes for a boolean value (encoded as `0x00` or `0x01`). |

---

## Storage Types

Types used for OPNet virtual machine storage.

```typescript
type MemorySlotData<T> = T;
type PointerStorage = DeterministicMap<MemorySlotPointer, MemorySlotData<bigint>>;
type BlockchainStorage = DeterministicMap<string, PointerStorage>;
```

| Type | Description |
|------|-------------|
| `MemorySlotData<T>` | Generic wrapper for a value stored in a memory slot. |
| `PointerStorage` | A deterministic map from storage pointers to `bigint` values. Represents one contract's storage. |
| `BlockchainStorage` | A deterministic map from contract identifiers to their `PointerStorage`. Represents the entire blockchain state. |

---

## Complete Reference Table

| Type / Constant | TypeScript Type | Byte Length | Constant Name |
|----------------|----------------|-------------|---------------|
| `u8` | `number` | 1 | `U8_BYTE_LENGTH` |
| `u16` | `number` | 2 | `U16_BYTE_LENGTH` |
| `u32` | `number` | 4 | `U32_BYTE_LENGTH` |
| `u64` | `bigint` | 8 | `U64_BYTE_LENGTH` |
| u128 (no alias) | `bigint` | 16 | `U128_BYTE_LENGTH` |
| u256 (no alias) | `bigint` | 32 | `U256_BYTE_LENGTH` |
| `i8` | `number` | 1 | `I8_BYTE_LENGTH` |
| `i16` | `number` | 2 | `I16_BYTE_LENGTH` |
| `i32` | `number` | 4 | `I32_BYTE_LENGTH` |
| `i64` | `bigint` | 8 | `I64_BYTE_LENGTH` |
| i128 (no alias) | `bigint` | 16 | `I128_BYTE_LENGTH` |
| i256 (no alias) | `bigint` | 32 | `I256_BYTE_LENGTH` |
| `Selector` | `number` | 4 | `SELECTOR_BYTE_LENGTH` |
| `boolean` | `boolean` | 1 | `BOOLEAN_BYTE_LENGTH` |
| `Address` | `Address` (class) | 32 | `ADDRESS_BYTE_LENGTH` |
| Extended Address | `Uint8Array` | 64 | `EXTENDED_ADDRESS_BYTE_LENGTH` |
| Schnorr Signature | `Uint8Array` | 64 | `SCHNORR_SIGNATURE_BYTE_LENGTH` |
| `BufferLike` | `Uint8Array` | Variable | -- |
| `MemorySlotPointer` | `bigint` | 32 | `U256_BYTE_LENGTH` |

---

## Examples

### Using Type Aliases for Clarity

```typescript
import type { u8, u32, u64, Selector } from '@btc-vision/transaction';

function processTransaction(
    version: u8,
    blockHeight: u32,
    amount: u64,
    functionSelector: Selector,
): void {
    // Types make it clear what size and range each parameter expects
    console.log(`Version: ${version}`);       // 0-255
    console.log(`Block: ${blockHeight}`);     // 0-4,294,967,295
    console.log(`Amount: ${amount}`);         // 0n to 2^64-1
    console.log(`Selector: 0x${functionSelector.toString(16)}`);
}
```

### Using Byte Length Constants in Binary Operations

```typescript
import { BufferHelper } from '@btc-vision/transaction';
import { U64_BYTE_LENGTH, U256_BYTE_LENGTH, ADDRESS_BYTE_LENGTH } from '@btc-vision/transaction';

// Convert a bigint to a specific byte width
const amountBytes = BufferHelper.valueToUint8Array(1000n, U64_BYTE_LENGTH);
console.log(amountBytes.length);  // 8

const storageValue = BufferHelper.valueToUint8Array(42n, U256_BYTE_LENGTH);
console.log(storageValue.length);  // 32

// Validate buffer lengths
function validateAddress(buffer: Uint8Array): boolean {
    return buffer.length === ADDRESS_BYTE_LENGTH;
}
```

### Storage Operations

```typescript
import type { MemorySlotPointer, PointerStorage } from '@btc-vision/transaction';
import { DeterministicMap } from '@btc-vision/transaction';

const storage: PointerStorage = new DeterministicMap<MemorySlotPointer, bigint>(
    (a, b) => (a < b ? -1 : a > b ? 1 : 0),
);

// Set storage slot 0 to value 42
storage.set(0n, 42n);

// Set storage slot 1 to value 100
storage.set(1n, 100n);

// Read a storage slot
const value = storage.get(0n);
console.log(value);  // 42n
```

---

## Related Documentation

- [BinaryWriter](../binary/binary-writer.md) -- Uses these types for method signatures and byte sizing
- [BufferHelper](./buffer-helper.md) -- Conversion functions that use byte length constants
- [BitcoinUtils](./bitcoin-utils.md) -- Bitcoin-specific utility functions
- [Deterministic Collections](../deterministic/deterministic-collections.md) -- DeterministicMap used by storage types
- [Address](../keypair/address.md) -- The Address type (32 bytes = ADDRESS_BYTE_LENGTH)
