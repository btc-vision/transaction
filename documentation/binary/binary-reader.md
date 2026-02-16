# BinaryReader

Type-safe binary deserialization for decoding OPNet calldata, contract return values, and event data.

## Overview

`BinaryReader` is the counterpart to `BinaryWriter`. It reads structured binary data from a `Uint8Array` buffer, advancing an internal offset as each value is consumed. It is used to decode contract return values, event data, and any binary payload produced by `BinaryWriter` or the OPNet runtime.

The reader performs bounds checking on every read operation, throwing an `Error` if a read would exceed the buffer length. This ensures corrupted or truncated data is caught early rather than producing silently wrong results.

**Source:** `src/buffer/BinaryReader.ts`

## Table of Contents

- [Constructor and Initialization](#constructor-and-initialization)
- [Endianness](#endianness)
- [Primitive Read Methods](#primitive-read-methods)
  - [Unsigned Integers](#unsigned-integers)
  - [Signed Integers](#signed-integers)
  - [Boolean and Selector](#boolean-and-selector)
- [String and Bytes Read Methods](#string-and-bytes-read-methods)
- [Address Read Methods](#address-read-methods)
- [Array Read Methods](#array-read-methods)
- [Map Read Methods](#map-read-methods)
- [Utility Methods and Properties](#utility-methods-and-properties)
- [Static Comparators](#static-comparators)
- [Examples](#examples)

---

## Constructor and Initialization

```typescript
import { BinaryReader } from '@btc-vision/transaction';

// Create from a Uint8Array
const reader = new BinaryReader(data);

// Create from the output of a BinaryWriter
const writer = new BinaryWriter();
writer.writeU256(42n);
const reader = writer.toBytesReader();
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `bytes` | `BufferLike` (`Uint8Array`) | The binary data to read from. The reader wraps a `DataView` over the underlying `ArrayBuffer`. |

The reader starts at offset 0 and advances through the buffer as values are read. The buffer itself is not copied; the reader references the original memory.

---

## Endianness

Many read methods accept a `be` (big-endian) parameter:

| Value | Byte Order | Description |
|-------|-----------|-------------|
| `true` (default) | Big-endian | Most significant byte first. This is the default for OPNet calldata. |
| `false` | Little-endian | Least significant byte first. |

The `be` parameter must match the endianness used when the data was written. Mismatched endianness will produce incorrect values without any error.

---

## Primitive Read Methods

### Unsigned Integers

| Method | Return Type | Size | Value Range |
|--------|------------|------|-------------|
| `readU8()` | `u8` (number) | 1 byte | 0 to 255 |
| `readU16(be?)` | `u16` (number) | 2 bytes | 0 to 65,535 |
| `readU32(be?)` | `u32` (number) | 4 bytes | 0 to 4,294,967,295 |
| `readU64(be?)` | `bigint` | 8 bytes | 0 to 2^64 - 1 |
| `readU128(be?)` | `bigint` | 16 bytes | 0 to 2^128 - 1 |
| `readU256(be?)` | `bigint` | 32 bytes | 0 to 2^256 - 1 |

```typescript
const a = reader.readU8();      // number
const b = reader.readU16();     // number
const c = reader.readU32();     // number
const d = reader.readU64();     // bigint
const e = reader.readU128();    // bigint
const f = reader.readU256();    // bigint

// Read in little-endian
const g = reader.readU32(false);
```

All methods throw an `Error` if reading would go past the end of the buffer.

### Signed Integers

| Method | Return Type | Size | Value Range |
|--------|------------|------|-------------|
| `readI8()` | `i8` (number) | 1 byte | -128 to 127 |
| `readI16(be?)` | `i16` (number) | 2 bytes | -32,768 to 32,767 |
| `readI32(be?)` | `i32` (number) | 4 bytes | -2,147,483,648 to 2,147,483,647 |
| `readI64(be?)` | `i64` (bigint) | 8 bytes | -2^63 to 2^63 - 1 |
| `readI128(be?)` | `bigint` | 16 bytes | -2^127 to 2^127 - 1 |

```typescript
const a = reader.readI8();      // number
const b = reader.readI16();     // number
const c = reader.readI32();     // number
const d = reader.readI64();     // bigint
const e = reader.readI128();    // bigint
```

`readI128` interprets the raw 16 bytes as a two's complement signed integer: if the most significant bit is set, the value is treated as negative.

### Boolean and Selector

| Method | Return Type | Size | Description |
|--------|------------|------|-------------|
| `readBoolean()` | `boolean` | 1 byte | Returns `true` if the byte is non-zero, `false` if zero |
| `readSelector()` | `Selector` (number) | 4 bytes | Reads a big-endian `u32` function selector |

```typescript
const flag = reader.readBoolean();    // true or false
const selector = reader.readSelector(); // e.g. 0x1a2b3c4d
```

The selector is always read in big-endian byte order.

---

## String and Bytes Read Methods

| Method | Parameters | Return Type | Description |
|--------|-----------|------------|-------------|
| `readBytes(length, zeroStop?)` | `length: u32`, `zeroStop?: boolean` | `Uint8Array` | Reads exactly `length` bytes. If `zeroStop` is `true`, reading stops at the first `0x00` byte and the returned array is truncated. |
| `readBytesWithLength(maxLength?, be?)` | `maxLength?: number`, `be?: boolean` | `Uint8Array` | Reads a `u32` length prefix, then that many bytes. Throws if length exceeds `maxLength` (when `maxLength > 0`). |
| `readString(length)` | `length: u32` | `string` | Reads `length` bytes and decodes them as UTF-8. |
| `readStringWithLength(be?)` | `be?: boolean` | `string` | Reads a `u32` length prefix, then decodes that many bytes as UTF-8. |

```typescript
// Read exactly 10 raw bytes
const raw = reader.readBytes(10);

// Read raw bytes, stopping early at 0x00
const nullTerminated = reader.readBytes(256, true);

// Read length-prefixed bytes
const data = reader.readBytesWithLength();

// Read length-prefixed bytes with a safety limit
const bounded = reader.readBytesWithLength(1024); // throws if length > 1024

// Read a fixed-length string
const name = reader.readString(5); // reads exactly 5 bytes as UTF-8

// Read a length-prefixed string
const label = reader.readStringWithLength();
```

**Wire format for `readBytesWithLength` / `readStringWithLength`:**
```
[u32 byte length][raw bytes...]
```

---

## Address Read Methods

| Method | Return Type | Size | Description |
|--------|------------|------|-------------|
| `readAddress()` | `Address` | 32 bytes | Reads a 32-byte MLDSA key hash and returns an `Address` instance |
| `readTweakedPublicKey()` | `Uint8Array` | 32 bytes | Reads a 32-byte tweaked public key as raw bytes |
| `readExtendedAddress()` | `Address` | 64 bytes | Reads both tweaked public key (32 bytes) and MLDSA key hash (32 bytes), returns an `Address` with both keys |
| `readSchnorrSignature()` | `SchnorrSignature` | 128 bytes | Reads a full extended address (64 bytes) followed by a 64-byte Schnorr signature |

```typescript
import { Address } from '@btc-vision/transaction';

// Read a standard 32-byte address
const addr: Address = reader.readAddress();

// Read just the tweaked public key as raw bytes
const tweakedKey: Uint8Array = reader.readTweakedPublicKey();

// Read a full 64-byte extended address
const extAddr: Address = reader.readExtendedAddress();

// Read a Schnorr signature with its signer address
const sig = reader.readSchnorrSignature();
console.log(sig.address);    // Address instance
console.log(sig.signature);  // Uint8Array (64 bytes)
```

### SchnorrSignature Interface

```typescript
interface SchnorrSignature {
    readonly address: Address;       // The signer's Address (both keys)
    readonly signature: Uint8Array;  // The 64-byte Schnorr signature
}
```

**Wire format for `readExtendedAddress`:**
```
[32 bytes tweakedPublicKey][32 bytes MLDSA key hash]
```

**Wire format for `readSchnorrSignature`:**
```
[32 bytes tweakedPublicKey][32 bytes MLDSA key hash][64 bytes signature]
```

---

## Array Read Methods

All array methods read a `u16` length prefix, then that many elements. The maximum array length is 65,535 elements.

| Method | Return Type | Element Size | Description |
|--------|------------|-------------|-------------|
| `readU8Array()` | `u8[]` | 1 byte each | Array of unsigned 8-bit integers |
| `readU16Array(be?)` | `u16[]` | 2 bytes each | Array of unsigned 16-bit integers |
| `readU32Array(be?)` | `u32[]` | 4 bytes each | Array of unsigned 32-bit integers |
| `readU64Array(be?)` | `bigint[]` | 8 bytes each | Array of unsigned 64-bit integers |
| `readU128Array(be?)` | `bigint[]` | 16 bytes each | Array of unsigned 128-bit integers |
| `readU256Array(be?)` | `bigint[]` | 32 bytes each | Array of unsigned 256-bit integers |
| `readStringArray(be?)` | `string[]` | variable | Each string has a `u32` length prefix |
| `readBytesArray(be?)` | `Uint8Array[]` | variable | Each byte array has a `u32` length prefix |
| `readAddressArray(be?)` | `Address[]` | 32 bytes each | Array of standard addresses |
| `readExtendedAddressArray(be?)` | `Address[]` | 64 bytes each | Array of extended addresses |
| `readArrayOfBuffer(be?)` | `Uint8Array[]` | variable | Each buffer has a `u32` length prefix |

```typescript
// Numeric arrays
const bytes = reader.readU8Array();        // u8[]
const shorts = reader.readU16Array();      // u16[]
const ints = reader.readU32Array();        // u32[]
const longs = reader.readU64Array();       // bigint[]
const big128 = reader.readU128Array();     // bigint[]
const big256 = reader.readU256Array();     // bigint[]

// String and bytes arrays
const strings = reader.readStringArray();  // string[]
const blobs = reader.readBytesArray();     // Uint8Array[]
const buffers = reader.readArrayOfBuffer(); // Uint8Array[]

// Address arrays
const addrs = reader.readAddressArray();             // Address[]
const extAddrs = reader.readExtendedAddressArray();  // Address[]
```

**Wire format for arrays:**
```
[u16 element count][element 0][element 1]...[element N-1]
```

For variable-length elements (strings, bytes, buffers), each element includes its own `u32` length prefix:
```
[u16 count][u32 len0][bytes0][u32 len1][bytes1]...
```

> **Note:** `readU8Array()` always reads its count prefix as big-endian. Other array methods accept the `be` parameter which controls endianness for both the count prefix and the element values.

---

## Map Read Methods

| Method | Return Type | Key Size | Value Size | Description |
|--------|------------|---------|-----------|-------------|
| `readAddressValueTuple(be?)` | `AddressMap<bigint>` | 32 bytes | 32 bytes (u256) | Reads a map of standard addresses to u256 values |
| `readExtendedAddressMapU256(be?)` | `ExtendedAddressMap<bigint>` | 64 bytes | 32 bytes (u256) | Reads a map of extended addresses to u256 values |

```typescript
import { AddressMap, ExtendedAddressMap } from '@btc-vision/transaction';

// Read a standard address -> u256 map
const balances: AddressMap<bigint> = reader.readAddressValueTuple();

// Read an extended address -> u256 map
const extBalances: ExtendedAddressMap<bigint> = reader.readExtendedAddressMapU256();

// Iterate over the map
for (const [address, value] of balances.entries()) {
    console.log(address, value);
}
```

**Wire format for `readAddressValueTuple`:**
```
[u16 count][32 bytes address][32 bytes u256 value]...[repeated]
```

**Wire format for `readExtendedAddressMapU256`:**
```
[u16 count][64 bytes extended address][32 bytes u256 value]...[repeated]
```

Both methods throw an `Error` if a duplicate address is encountered in the map data.

---

## Utility Methods and Properties

| Method / Property | Type | Description |
|-------------------|------|-------------|
| `byteLength` (getter) | `number` | Total byte length of the underlying buffer |
| `length()` | `number` | Same as `byteLength` -- total byte length of the buffer |
| `bytesLeft()` | `number` | Number of bytes remaining from the current offset to the end of the buffer |
| `getOffset()` | `u16` | Returns the current read offset |
| `setOffset(offset)` | `void` | Manually sets the read offset. Use with caution. |
| `setBuffer(bytes)` | `void` | Replaces the underlying buffer and resets the offset to 0 |
| `verifyEnd(size)` | `void` | Throws if `size` exceeds the buffer byte length. Used internally before every read. |

```typescript
// Check buffer dimensions
console.log('Total bytes:', reader.byteLength);
console.log('Bytes read so far:', reader.getOffset());
console.log('Bytes remaining:', reader.bytesLeft());

// Peek at data without consuming it
const savedOffset = reader.getOffset();
const peekValue = reader.readU32();
reader.setOffset(savedOffset); // rewind

// Replace the buffer entirely
reader.setBuffer(newData);
// Offset is now 0 and reads come from newData

// Ensure we have consumed everything
if (reader.bytesLeft() !== 0) {
    throw new Error('Unexpected trailing data');
}
```

---

## Static Comparators

`BinaryReader` provides three static comparison functions suitable for use with `Array.prototype.sort()`:

| Method | Parameters | Description |
|--------|-----------|-------------|
| `BinaryReader.stringCompare(a, b)` | `a: string`, `b: string` | Locale-aware string comparison via `localeCompare` |
| `BinaryReader.bigintCompare(a, b)` | `a: bigint`, `b: bigint` | Numeric comparison for `bigint` values |
| `BinaryReader.numberCompare(a, b)` | `a: number`, `b: number` | Numeric comparison for `number` values |

All return `-1`, `0`, or `1` following the standard comparator contract.

```typescript
const values = [300n, 100n, 200n];
values.sort(BinaryReader.bigintCompare);
// [100n, 200n, 300n]

const names = ['charlie', 'alice', 'bob'];
names.sort(BinaryReader.stringCompare);
// ['alice', 'bob', 'charlie']
```

---

## Examples

### Reading Contract Return Values

When a contract function returns data, decode it with `BinaryReader`:

```typescript
import { BinaryReader } from '@btc-vision/transaction';

// Assume `returnData` is the Uint8Array returned by the contract
const reader = new BinaryReader(returnData);

// Decode a balanceOf(address) return value
const balance: bigint = reader.readU256();
console.log('Balance:', balance);
```

### Decoding Event Data

```typescript
import { BinaryReader } from '@btc-vision/transaction';

// Event: Transfer(address from, address to, uint256 value)
const reader = new BinaryReader(eventData);

const from = reader.readAddress();
const to = reader.readAddress();
const value = reader.readU256();

console.log(`Transfer: ${value} from ${from} to ${to}`);
```

### Decoding Complex Return Data

```typescript
const reader = new BinaryReader(returnData);

// A function that returns (string name, string symbol, u8 decimals, u256 totalSupply)
const name = reader.readStringWithLength();
const symbol = reader.readStringWithLength();
const decimals = reader.readU8();
const totalSupply = reader.readU256();

console.log(`${name} (${symbol}), decimals: ${decimals}, supply: ${totalSupply}`);
```

### Round-Trip Encode / Decode

```typescript
import { BinaryWriter, BinaryReader } from '@btc-vision/transaction';

// Encode
const writer = new BinaryWriter();
writer.writeSelector(0xa9059cbb);
writer.writeAddress(recipientAddress);
writer.writeU256(1000000000000000000n);
writer.writeBoolean(true);
writer.writeStringWithLength('memo: payment');
writer.writeU64Array([1n, 2n, 3n]);

// Decode
const reader = writer.toBytesReader();

const selector = reader.readSelector();             // 0xa9059cbb
const addr = reader.readAddress();                   // recipientAddress
const amount = reader.readU256();                    // 1000000000000000000n
const flag = reader.readBoolean();                   // true
const memo = reader.readStringWithLength();          // 'memo: payment'
const ids = reader.readU64Array();                   // [1n, 2n, 3n]

// Verify all data was consumed
console.log('Bytes remaining:', reader.bytesLeft()); // 0
```

### Usage with ABICoder

The `ABICoder` class uses `BinaryReader` internally to decode return values based on ABI type definitions:

```typescript
import { ABICoder, BinaryReader } from '@btc-vision/transaction';
import { ABIDataTypes } from '@btc-vision/transaction';

const coder = new ABICoder();

// Decode return data using ABI type descriptors
const decoded = coder.decodeData(returnData, [
    ABIDataTypes.ADDRESS,
    ABIDataTypes.UINT256,
    ABIDataTypes.BOOL,
    ABIDataTypes.STRING,
]);

const [address, amount, success, message] = decoded;
```

You can also use `ABICoder.decodeSingleValue` for fine-grained control:

```typescript
const reader = new BinaryReader(data);

// Skip the 4-byte selector
reader.readSelector();

// Decode individual values
const addr = coder.decodeSingleValue(reader, ABIDataTypes.ADDRESS);
const value = coder.decodeSingleValue(reader, ABIDataTypes.UINT256);
const balances = coder.decodeSingleValue(reader, ABIDataTypes.ADDRESS_UINT256_TUPLE);
```

### Reading Maps and Iterating

```typescript
import { BinaryReader, AddressMap } from '@btc-vision/transaction';

const reader = new BinaryReader(data);

// Read an address -> u256 map (e.g., token allowances)
const allowances: AddressMap<bigint> = reader.readAddressValueTuple();

// Check a specific address
if (allowances.has(spenderAddress)) {
    const allowance = allowances.get(spenderAddress);
    console.log('Allowance:', allowance);
}

// Iterate all entries
for (const [addr, value] of allowances.entries()) {
    console.log(`${addr}: ${value}`);
}
```

### Rewinding and Re-reading

```typescript
const reader = new BinaryReader(data);

// Read the selector to determine which decoder to use
const selector = reader.readSelector();

if (selector === 0xa9059cbb) {
    // transfer(address, u256)
    const to = reader.readAddress();
    const amount = reader.readU256();
} else if (selector === 0x095ea7b3) {
    // approve(address, u256)
    const spender = reader.readAddress();
    const amount = reader.readU256();
} else {
    // Unknown selector -- rewind and read raw
    reader.setOffset(0);
    const raw = reader.readBytes(reader.byteLength);
}
```

### Verifying Buffer Consumption

After decoding, it is good practice to check that all bytes were consumed:

```typescript
const reader = new BinaryReader(data);

const value1 = reader.readU256();
const value2 = reader.readU64();

if (reader.bytesLeft() !== 0) {
    console.warn(`Warning: ${reader.bytesLeft()} unexpected trailing bytes`);
}
```
