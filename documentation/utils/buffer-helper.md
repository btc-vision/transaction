# BufferHelper

Static utility methods for converting between `Uint8Array`, hex strings, `bigint`, and `MemorySlotPointer` values.

## Overview

`BufferHelper` provides low-level conversion functions used throughout the OPNet codebase for translating between binary data representations. It handles hex encoding/decoding (with automatic `0x` prefix stripping), bigint-to-byte-array conversions with configurable padding, and MemorySlotPointer (256-bit unsigned integer) conversions.

All values are treated as unsigned big-endian integers. The default byte length for `valueToUint8Array` is 32 bytes (256 bits), matching OPNet's standard U256 storage slot size.

**Source:** `src/utils/BufferHelper.ts`

## Table of Contents

- [Import](#import)
- [Constants](#constants)
- [Methods](#methods)
  - [uint8ArrayToHex](#uint8arraytohex)
  - [hexToUint8Array](#hextouint8array)
  - [valueToUint8Array](#valuetouint8array)
  - [uint8ArrayToValue](#uint8arraytovalue)
  - [pointerToUint8Array](#pointertouint8array)
  - [uint8ArrayToPointer](#uint8arraytopointer)
  - [bufferToUint8Array](#buffertouint8array)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Import

```typescript
import { BufferHelper } from '@btc-vision/transaction';
```

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `EXPECTED_BUFFER_LENGTH` | `32` | The standard buffer length for OPNet storage values (256 bits). |

---

## Methods

### uint8ArrayToHex

```typescript
static uint8ArrayToHex(input: Uint8Array): string
```

Converts a `Uint8Array` to a hex string (without `0x` prefix). Delegates to `toHex()` from `@btc-vision/bitcoin`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `Uint8Array` | The byte array to convert. |

**Returns:** `string` -- Hex string without prefix.

```typescript
const hex = BufferHelper.uint8ArrayToHex(new Uint8Array([0xab, 0xcd, 0xef]));
// hex = 'abcdef'
```

### hexToUint8Array

```typescript
static hexToUint8Array(input: string): Uint8Array
```

Converts a hex string to a `Uint8Array`. Automatically strips `0x` or `0X` prefix if present. Pads with a leading zero if the hex length is odd.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `string` | Hex string (with or without `0x` prefix). |

**Returns:** `Uint8Array` -- The decoded byte array.

```typescript
const bytes = BufferHelper.hexToUint8Array('0xabcdef');
// bytes = Uint8Array [0xab, 0xcd, 0xef]

const bytes2 = BufferHelper.hexToUint8Array('abcdef');
// bytes2 = Uint8Array [0xab, 0xcd, 0xef]

// Odd-length hex is padded with leading zero
const bytes3 = BufferHelper.hexToUint8Array('abc');
// bytes3 = Uint8Array [0x0a, 0xbc]
```

### valueToUint8Array

```typescript
static valueToUint8Array(value: bigint, length: number = 32): Uint8Array
```

Converts a `bigint` value to a fixed-length `Uint8Array` with big-endian encoding and zero-padding on the left.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | `bigint` | -- | The unsigned integer value to convert. |
| `length` | `number` | `32` | The output byte length (padded with leading zeros). |

**Returns:** `Uint8Array` -- The big-endian byte representation, left-padded to `length` bytes.

**Throws:**
- `RangeError('Value cannot be negative')` if `value < 0n`.
- `RangeError` if the value exceeds the range representable by `length` bytes.

```typescript
// Convert to 32-byte (U256) representation
const bytes = BufferHelper.valueToUint8Array(255n);
// bytes = Uint8Array [0, 0, ..., 0, 0xff]  (32 bytes)

// Convert to 8-byte (U64) representation
const bytes64 = BufferHelper.valueToUint8Array(1000n, 8);
// bytes64 = Uint8Array [0, 0, 0, 0, 0, 0, 0x03, 0xe8]

// Convert to 4-byte (U32) representation
const bytes32 = BufferHelper.valueToUint8Array(42n, 4);
// bytes32 = Uint8Array [0, 0, 0, 42]
```

### uint8ArrayToValue

```typescript
static uint8ArrayToValue(input: Uint8Array): bigint
```

Converts a `Uint8Array` to a `bigint` value, interpreting the bytes as a big-endian unsigned integer.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `Uint8Array` | The byte array to convert. |

**Returns:** `bigint` -- The unsigned integer value. Returns `0n` for empty arrays.

```typescript
const value = BufferHelper.uint8ArrayToValue(new Uint8Array([0x00, 0xff]));
// value = 255n

const value2 = BufferHelper.uint8ArrayToValue(new Uint8Array([0x01, 0x00]));
// value2 = 256n

const zero = BufferHelper.uint8ArrayToValue(new Uint8Array([]));
// zero = 0n
```

### pointerToUint8Array

```typescript
static pointerToUint8Array(pointer: MemorySlotPointer): Uint8Array
```

Converts a `MemorySlotPointer` (bigint) to a 32-byte `Uint8Array`, zero-padded on the left.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pointer` | `MemorySlotPointer` | A 256-bit unsigned storage pointer. |

**Returns:** `Uint8Array` -- 32-byte big-endian representation.

**Throws:**
- `RangeError('Pointer cannot be negative')` if the pointer is negative.
- `RangeError('Pointer exceeds 256-bit range')` if the hex representation exceeds 64 characters.

### uint8ArrayToPointer

```typescript
static uint8ArrayToPointer(input: Uint8Array): MemorySlotPointer
```

Converts a `Uint8Array` to a `MemorySlotPointer` (bigint).

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `Uint8Array` | The byte array to convert. |

**Returns:** `MemorySlotPointer` (bigint) -- Returns `0n` for empty arrays.

### bufferToUint8Array

```typescript
static bufferToUint8Array(buffer: Uint8Array): Uint8Array
```

Creates a new `Uint8Array` copy of the input. Useful for ensuring the result is a standalone `Uint8Array` and not a view into a larger buffer.

| Parameter | Type | Description |
|-----------|------|-------------|
| `buffer` | `Uint8Array` | The source byte array. |

**Returns:** `Uint8Array` -- A new copy.

---

## Examples

### Round-Trip Conversions

```typescript
import { BufferHelper } from '@btc-vision/transaction';

// bigint -> Uint8Array -> bigint
const original = 1234567890123456789012345678901234567890n;
const bytes = BufferHelper.valueToUint8Array(original);
const recovered = BufferHelper.uint8ArrayToValue(bytes);
console.log(original === recovered);  // true

// hex -> Uint8Array -> hex
const hexStr = '0xdeadbeef';
const decoded = BufferHelper.hexToUint8Array(hexStr);
const reencoded = BufferHelper.uint8ArrayToHex(decoded);
console.log(reencoded);  // 'deadbeef' (no 0x prefix)
```

### Working with Storage Pointers

```typescript
import { BufferHelper } from '@btc-vision/transaction';

// Convert a storage slot pointer to bytes for binary encoding
const pointer = 42n;
const pointerBytes = BufferHelper.pointerToUint8Array(pointer);
console.log(pointerBytes.length);  // 32

// Convert bytes back to a pointer
const restoredPointer = BufferHelper.uint8ArrayToPointer(pointerBytes);
console.log(restoredPointer === 42n);  // true
```

### Converting Values with Different Byte Lengths

```typescript
// U8 (1 byte)
const u8 = BufferHelper.valueToUint8Array(255n, 1);

// U16 (2 bytes)
const u16 = BufferHelper.valueToUint8Array(65535n, 2);

// U32 (4 bytes)
const u32 = BufferHelper.valueToUint8Array(4294967295n, 4);

// U64 (8 bytes)
const u64 = BufferHelper.valueToUint8Array(18446744073709551615n, 8);

// U256 (32 bytes, default)
const u256 = BufferHelper.valueToUint8Array(42n);
```

---

## Related Documentation

- [BitcoinUtils](./bitcoin-utils.md) -- BTC conversion, random bytes, and hashing
- [Types and Constants](./types-and-constants.md) -- Byte length constants used with valueToUint8Array
- [BinaryWriter](../binary/binary-writer.md) -- Higher-level binary serialization
