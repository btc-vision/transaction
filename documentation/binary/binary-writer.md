# BinaryWriter

Type-safe binary serialization for OPNet calldata encoding.

## Overview

`BinaryWriter` is a low-level serialization class that writes structured binary data into a dynamically resizing `Uint8Array` buffer. It is the primary tool for encoding calldata sent to OPNet smart contracts, including function selectors, primitive values, addresses, arrays, and maps.

The writer maintains an internal offset that advances automatically as data is written. The buffer grows on demand -- callers do not need to pre-calculate the total size. When writing is complete, call `getBuffer()` to obtain the finalized `Uint8Array`.

`BinaryWriter` implements the `Disposable` interface and can be used with the `using` keyword for automatic cleanup.

**Source:** `src/buffer/BinaryWriter.ts`

## Table of Contents

- [Constructor and Creation](#constructor-and-creation)
- [Endianness](#endianness)
- [Primitive Write Methods](#primitive-write-methods)
  - [Unsigned Integers](#unsigned-integers)
  - [Signed Integers](#signed-integers)
  - [Boolean and Selector](#boolean-and-selector)
- [String and Bytes Write Methods](#string-and-bytes-write-methods)
- [Address Write Methods](#address-write-methods)
- [Array Write Methods](#array-write-methods)
- [Map Write Methods](#map-write-methods)
- [Utility Methods](#utility-methods)
- [Examples](#examples)

---

## Constructor and Creation

```typescript
import { BinaryWriter } from '@btc-vision/transaction';

// Create with no initial allocation (buffer grows as needed)
const writer = new BinaryWriter();

// Create with a pre-allocated buffer size (optimization for known sizes)
const writer = new BinaryWriter(256);

// Using the Disposable pattern
{
    using writer = new BinaryWriter();
    writer.writeSelector(0xaabbccdd);
    writer.writeU256(1000n);
    const data = writer.getBuffer();
    // writer is automatically cleared when the block exits
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `length` | `number` | `0` | Initial buffer size in bytes. The buffer resizes automatically when writes exceed this size. |

---

## Endianness

Many write methods accept a `be` (big-endian) parameter:

| Value | Byte Order | Description |
|-------|-----------|-------------|
| `true` (default) | Big-endian | Most significant byte first. This is the default for OPNet calldata and the standard network byte order. |
| `false` | Little-endian | Least significant byte first. Used in specific protocol contexts. |

The `be` parameter defaults to `true` for all methods that accept it. Single-byte methods (`writeU8`, `writeI8`) do not accept `be` because endianness is irrelevant for a single byte.

---

## Primitive Write Methods

### Unsigned Integers

| Method | Type | Size | Value Range |
|--------|------|------|-------------|
| `writeU8(value)` | `u8` (number) | 1 byte | 0 to 255 |
| `writeU16(value, be?)` | `u16` (number) | 2 bytes | 0 to 65,535 |
| `writeU32(value, be?)` | `u32` (number) | 4 bytes | 0 to 4,294,967,295 |
| `writeU64(value, be?)` | `u64` (bigint) | 8 bytes | 0 to 18,446,744,073,709,551,615 |
| `writeU128(value, be?)` | `bigint` | 16 bytes | 0 to 2^128 - 1 |
| `writeU256(value, be?)` | `bigint` | 32 bytes | 0 to 2^256 - 1 |

```typescript
writer.writeU8(42);
writer.writeU16(1000);
writer.writeU32(100000);
writer.writeU64(9007199254740993n);
writer.writeU128(340282366920938463463374607431768211455n);
writer.writeU256(1000000000000000000n);

// Write in little-endian
writer.writeU32(100000, false);
```

All unsigned integer methods throw an `Error` if the value exceeds the valid range for the type.

### Signed Integers

| Method | Type | Size | Value Range |
|--------|------|------|-------------|
| `writeI8(value)` | `i8` (number) | 1 byte | -128 to 127 |
| `writeI16(value, be?)` | `i16` (number) | 2 bytes | -32,768 to 32,767 |
| `writeI32(value, be?)` | `i32` (number) | 4 bytes | -2,147,483,648 to 2,147,483,647 |
| `writeI64(value, be?)` | `i64` (bigint) | 8 bytes | -2^63 to 2^63 - 1 |
| `writeI128(value, be?)` | `bigint` | 16 bytes | -2^127 to 2^127 - 1 |

```typescript
writer.writeI8(-42);
writer.writeI16(-1000);
writer.writeI32(-100000);
writer.writeI64(-9007199254740993n);
writer.writeI128(-170141183460469231731687303715884105728n);
```

All signed integer methods throw an `Error` if the value is outside the valid range for the type.

### Boolean and Selector

| Method | Type | Size | Description |
|--------|------|------|-------------|
| `writeBoolean(value)` | `boolean` | 1 byte | Writes `1` for `true`, `0` for `false` |
| `writeSelector(value)` | `Selector` (number) | 4 bytes | Writes a function selector as a big-endian `u32` |

```typescript
writer.writeBoolean(true);   // writes 0x01
writer.writeBoolean(false);  // writes 0x00

// Function selector (first 4 bytes of SHA-256 of the function signature)
writer.writeSelector(0x1a2b3c4d);
```

The selector is always written in big-endian byte order regardless of any `be` parameter.

---

## String and Bytes Write Methods

| Method | Parameters | Description |
|--------|-----------|-------------|
| `writeBytes(value)` | `value: Uint8Array` | Writes raw bytes with no length prefix |
| `writeBytesWithLength(value)` | `value: Uint8Array` | Writes a `u32` length prefix followed by the raw bytes |
| `writeString(value)` | `value: string` | UTF-8 encodes the string and writes raw bytes with no length prefix |
| `writeStringWithLength(value)` | `value: string` | UTF-8 encodes the string, writes a `u32` length prefix, then the bytes |

```typescript
// Raw bytes (caller must know the length when reading)
const raw = new Uint8Array([0x01, 0x02, 0x03]);
writer.writeBytes(raw);

// Length-prefixed bytes (self-describing)
writer.writeBytesWithLength(raw);
// Wire format: [00 00 00 03] [01 02 03]

// Raw string (caller must know the length when reading)
writer.writeString('hello');

// Length-prefixed string (self-describing)
writer.writeStringWithLength('hello');
// Wire format: [00 00 00 05] [68 65 6c 6c 6f]
```

> **Note:** `writeStringWithLength` uses a `u32` length prefix (not `u16`). The length is the byte length of the UTF-8 encoded string, not the character count.

---

## Address Write Methods

OPNet uses two address representations:

| Format | Size | Contents |
|--------|------|----------|
| Standard address | 32 bytes | MLDSA key hash only |
| Extended address | 64 bytes | Tweaked public key (32 bytes) + MLDSA key hash (32 bytes) |

| Method | Parameters | Size | Description |
|--------|-----------|------|-------------|
| `writeAddress(value)` | `value: Address` | 32 bytes | Writes the MLDSA key hash portion of an Address |
| `writeTweakedPublicKey(value)` | `value: Address` | 32 bytes | Writes the tweaked public key portion of an Address |
| `writeExtendedAddress(value)` | `value: Address` | 64 bytes | Writes both tweaked public key and MLDSA key hash |
| `writeSchnorrSignature(address, signature)` | `address: Address`, `signature: Uint8Array` | 128 bytes | Writes a full extended address followed by a 64-byte Schnorr signature |

```typescript
import { Address } from '@btc-vision/transaction';

const address: Address = /* ... */;

// Write only the 32-byte MLDSA key hash
writer.writeAddress(address);

// Write only the 32-byte tweaked public key
writer.writeTweakedPublicKey(address);

// Write the full 64-byte extended address
writer.writeExtendedAddress(address);

// Write an extended address + Schnorr signature (128 bytes total)
const signature = new Uint8Array(64); // 64-byte Schnorr signature
writer.writeSchnorrSignature(address, signature);
```

**Wire format for `writeExtendedAddress`:**
```
[32 bytes tweakedPublicKey][32 bytes MLDSA key hash]
```

**Wire format for `writeSchnorrSignature`:**
```
[32 bytes tweakedPublicKey][32 bytes MLDSA key hash][64 bytes signature]
```

`writeAddress` throws if the address byte length exceeds 32 bytes. `writeSchnorrSignature` throws if the signature is not exactly 64 bytes.

---

## Array Write Methods

All array methods write a `u16` length prefix followed by the array elements. The maximum array length is 65,535 elements.

| Method | Element Type | Element Size | Description |
|--------|-------------|-------------|-------------|
| `writeU8Array(value)` | `u8[]` | 1 byte each | Array of unsigned 8-bit integers |
| `writeU16Array(value, be?)` | `u16[]` | 2 bytes each | Array of unsigned 16-bit integers |
| `writeU32Array(value, be?)` | `u32[]` | 4 bytes each | Array of unsigned 32-bit integers |
| `writeU64Array(value, be?)` | `bigint[]` | 8 bytes each | Array of unsigned 64-bit integers |
| `writeU128Array(value, be?)` | `bigint[]` | 16 bytes each | Array of unsigned 128-bit integers |
| `writeU256Array(value, be?)` | `bigint[]` | 32 bytes each | Array of unsigned 256-bit integers |
| `writeStringArray(value)` | `string[]` | variable | Each string is written with a `u32` length prefix |
| `writeBytesArray(value)` | `Uint8Array[]` | variable | Each byte array is written with a `u32` length prefix |
| `writeAddressArray(value)` | `Address[]` | 32 bytes each | Array of standard (MLDSA) addresses |
| `writeExtendedAddressArray(value)` | `Address[]` | 64 bytes each | Array of extended addresses |
| `writeArrayOfBuffer(values, be?)` | `Uint8Array[]` | variable | Each buffer is written with a `u32` length prefix |

```typescript
// Numeric arrays
writer.writeU8Array([1, 2, 3]);
writer.writeU16Array([100, 200, 300]);
writer.writeU32Array([100000, 200000]);
writer.writeU64Array([1000000n, 2000000n]);
writer.writeU128Array([1n, 2n, 3n]);
writer.writeU256Array([1000000000000000000n, 2000000000000000000n]);

// String array
writer.writeStringArray(['hello', 'world']);

// Bytes array
writer.writeBytesArray([
    new Uint8Array([0x01, 0x02]),
    new Uint8Array([0x03, 0x04, 0x05]),
]);

// Address arrays
writer.writeAddressArray([address1, address2]);
writer.writeExtendedAddressArray([address1, address2]);

// Generic buffer array
writer.writeArrayOfBuffer([buffer1, buffer2]);
```

**Wire format for arrays:**
```
[u16 element count][element 0][element 1]...[element N-1]
```

For variable-length elements (strings, bytes, buffers), each element includes its own `u32` length prefix:
```
[u16 count][u32 len0][bytes0][u32 len1][bytes1]...
```

---

## Map Write Methods

| Method | Key Type | Value Type | Description |
|--------|---------|-----------|-------------|
| `writeAddressValueTuple(map, be?)` | `Address` (32 bytes) | `bigint` (u256) | Writes a map of standard addresses to u256 values |
| `writeExtendedAddressMapU256(map, be?)` | `Address` (64 bytes) | `bigint` (u256) | Writes a map of extended addresses to u256 values |

```typescript
import { AddressMap, ExtendedAddressMap } from '@btc-vision/transaction';

// Standard address -> u256 map
const balances = new AddressMap<bigint>();
balances.set(address1, 1000000000000000000n);
balances.set(address2, 2000000000000000000n);
writer.writeAddressValueTuple(balances);

// Extended address -> u256 map
const extBalances = new ExtendedAddressMap<bigint>();
extBalances.set(address1, 500n);
writer.writeExtendedAddressMapU256(extBalances);
```

**Wire format for `writeAddressValueTuple`:**
```
[u16 count][32 bytes address][32 bytes u256 value]...[repeated]
```

**Wire format for `writeExtendedAddressMapU256`:**
```
[u16 count][64 bytes extended address][32 bytes u256 value]...[repeated]
```

The maximum map size is 65,535 entries.

---

## Utility Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getBuffer(clear?)` | `Uint8Array` | Returns the written data as a `Uint8Array`. If `clear` is `true` (default), the writer is reset afterward. |
| `getOffset()` | `u32` | Returns the current write offset (the number of bytes written so far). |
| `setOffset(offset)` | `void` | Manually sets the write offset. Use with caution. |
| `reset()` | `void` | Resets the offset to 0 and reinitializes the buffer to 4 bytes. |
| `clear()` | `void` | Resets the offset to 0 and reinitializes the buffer to 0 bytes. |
| `toBytesReader()` | `BinaryReader` | Creates a `BinaryReader` from the current buffer contents. Calls `getBuffer()` internally (which clears the writer). |
| `allocSafe(size)` | `void` | Ensures the internal buffer has room for `size` additional bytes. Resizes if necessary. |
| `[Symbol.dispose]()` | `void` | Calls `clear()`. Allows use with `using` keyword. |
| `static estimateArrayOfBufferLength(values)` | `u32` | Calculates the total byte length needed for `writeArrayOfBuffer`, including the u16 count prefix and all u32 length prefixes. |

### getBuffer

```typescript
// Get buffer and clear the writer (default)
const data: Uint8Array = writer.getBuffer();

// Get buffer without clearing
const data: Uint8Array = writer.getBuffer(false);
// Writer retains its state; you can continue writing
```

### toBytesReader

```typescript
const writer = new BinaryWriter();
writer.writeU32(42);
writer.writeString('hello');

// Convert to reader for immediate verification
const reader: BinaryReader = writer.toBytesReader();
// Note: the writer is cleared after this call
```

### estimateArrayOfBufferLength

```typescript
const buffers = [
    new Uint8Array(100),
    new Uint8Array(200),
    new Uint8Array(50),
];

const totalBytes = BinaryWriter.estimateArrayOfBufferLength(buffers);
// totalBytes = 2 (u16 count) + 3 * 4 (u32 length prefixes) + 100 + 200 + 50 = 364
```

---

## Examples

### Encoding Calldata for a Contract Function Call

A typical contract interaction encodes a function selector followed by the function arguments:

```typescript
import { BinaryWriter } from '@btc-vision/transaction';

// Encode a "transfer(address, u256)" call
const writer = new BinaryWriter();

// Write the 4-byte function selector
writer.writeSelector(0xa9059cbb);

// Write the recipient address (32 bytes)
writer.writeAddress(recipientAddress);

// Write the amount as u256 (32 bytes)
writer.writeU256(1000000000000000000n);

// Get the final calldata
const calldata: Uint8Array = writer.getBuffer();
```

### Encoding Multiple Parameters

```typescript
const writer = new BinaryWriter();
writer.writeSelector(0xdeadbeef);

// Mixed parameter types
writer.writeBoolean(true);
writer.writeU64(1000n);
writer.writeStringWithLength('metadata');
writer.writeAddress(contractAddress);
writer.writeU256Array([100n, 200n, 300n]);

const calldata = writer.getBuffer();
```

### Building Constructor Calldata for Deployment

```typescript
const writer = new BinaryWriter();

// Constructor parameters for a token contract
writer.writeStringWithLength('My Token');      // name
writer.writeStringWithLength('MTK');            // symbol
writer.writeU8(18);                             // decimals
writer.writeU256(1000000000000000000000000n);   // totalSupply

const constructorCalldata = writer.getBuffer();
```

### Round-Trip Encoding and Decoding

```typescript
import { BinaryWriter, BinaryReader } from '@btc-vision/transaction';

// Encode
const writer = new BinaryWriter();
writer.writeSelector(0x12345678);
writer.writeU256(42n);
writer.writeBoolean(true);
writer.writeStringWithLength('test');

// Decode using toBytesReader
const reader = writer.toBytesReader();

const selector = reader.readSelector();       // 0x12345678
const amount = reader.readU256();             // 42n
const flag = reader.readBoolean();            // true
const name = reader.readStringWithLength();   // 'test'
```

### Using with ABICoder

```typescript
import { BinaryWriter, ABICoder } from '@btc-vision/transaction';

const coder = new ABICoder();

// Get the selector for a function signature
const selectorHex = coder.encodeSelector('transfer(address,uint256)');
const selectorValue = parseInt(selectorHex, 16);

// Build calldata
const writer = new BinaryWriter();
writer.writeSelector(selectorValue);
writer.writeAddress(recipientAddress);
writer.writeU256(amount);

const calldata = writer.getBuffer();
```

### Writing Address Maps

```typescript
import { BinaryWriter, AddressMap } from '@btc-vision/transaction';

const writer = new BinaryWriter();
writer.writeSelector(0xaabbccdd);

// Build an address-to-balance map
const approvals = new AddressMap<bigint>();
approvals.set(spender1, 1000n);
approvals.set(spender2, 2000n);

writer.writeAddressValueTuple(approvals);
const calldata = writer.getBuffer();
```

### Disposable Pattern

```typescript
{
    using writer = new BinaryWriter();
    writer.writeSelector(0x12345678);
    writer.writeU256(100n);
    const data = writer.getBuffer(false);
    // Use data...
} // writer.clear() is called automatically here
```
