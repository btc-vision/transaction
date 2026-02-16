# BitcoinUtils

Static utility methods for Bitcoin-related conversions, random number generation, hex validation, and hashing.

## Overview

`BitcoinUtils` is a static utility class that provides common Bitcoin-related helper functions used throughout the OPNet codebase. It handles BTC-to-satoshi conversion, cryptographically secure random byte generation (with browser and Node.js support), hex string validation, and OPNet-specific SHA-512 hashing.

**Source:** `src/utils/BitcoinUtils.ts`

## Table of Contents

- [Import](#import)
- [Methods](#methods)
  - [btcToSatoshi](#btctosatoshi)
  - [rndBytes](#rndbytes)
  - [getSafeRandomValues](#getsaferandomvalues)
  - [isValidHex](#isvalidhex)
  - [opnetHash](#opnethash)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Import

```typescript
import { BitcoinUtils } from '@btc-vision/transaction';
```

---

## Methods

### btcToSatoshi

```typescript
static btcToSatoshi(btc: number): bigint
```

Converts a BTC amount to satoshis. One BTC equals 100,000,000 satoshis.

| Parameter | Type | Description |
|-----------|------|-------------|
| `btc` | `number` | The amount in BTC. |

**Returns:** `bigint` -- The equivalent amount in satoshis.

```typescript
const sats = BitcoinUtils.btcToSatoshi(1.5);
// sats = 150000000n

const dust = BitcoinUtils.btcToSatoshi(0.0000033);
// dust = 330n
```

### rndBytes

```typescript
static rndBytes(): Uint8Array
```

Generates 64 cryptographically secure random bytes. This is a convenience wrapper around `getSafeRandomValues(64)`.

**Returns:** `Uint8Array` -- 64 random bytes.

```typescript
const random = BitcoinUtils.rndBytes();
console.log(random.length);  // 64
```

### getSafeRandomValues

```typescript
static getSafeRandomValues(length: number): Uint8Array
```

Generates cryptographically secure random bytes using the best available source. Supports both browser and Node.js environments.

| Parameter | Type | Description |
|-----------|------|-------------|
| `length` | `number` | Number of random bytes to generate. |

**Returns:** `Uint8Array` -- The random bytes.

**Throws:** `Error('No secure random number generator available...')` if neither `window.crypto.getRandomValues` nor `globalThis.crypto.getRandomValues` is available.

**Resolution order:**
1. `window.crypto.getRandomValues` (browser with window context)
2. `globalThis.crypto.getRandomValues` (Node.js 19+ or Web Workers)
3. Throws an error if neither is available.

```typescript
// Generate a 32-byte random salt
const salt = BitcoinUtils.getSafeRandomValues(32);

// Generate a random nonce
const nonce = BitcoinUtils.getSafeRandomValues(16);
```

### isValidHex

```typescript
static isValidHex(hex: string): boolean
```

Tests whether a string contains only valid hexadecimal characters (`0-9`, `a-f`, `A-F`). Does NOT accept a `0x` prefix.

| Parameter | Type | Description |
|-----------|------|-------------|
| `hex` | `string` | The string to validate. |

**Returns:** `boolean` -- `true` if the string is valid hexadecimal.

```typescript
BitcoinUtils.isValidHex('abcdef1234');   // true
BitcoinUtils.isValidHex('ABCDEF');       // true
BitcoinUtils.isValidHex('0xabcdef');     // false (0x prefix not accepted)
BitcoinUtils.isValidHex('ghijkl');       // false
BitcoinUtils.isValidHex('');             // false
```

### opnetHash

```typescript
static opnetHash(data: Uint8Array): string
```

Computes a SHA-512 hash of the given data and returns it as a `0x`-prefixed hex string. This is used as the standard hashing function throughout OPNet.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Uint8Array` | The data to hash. |

**Returns:** `string` -- The `0x`-prefixed hex string of the 64-byte SHA-512 hash.

```typescript
const hash = BitcoinUtils.opnetHash(new Uint8Array([1, 2, 3]));
console.log(hash);  // '0x27864cc5219...' (128 hex chars + '0x' prefix)
```

---

## Examples

### Converting BTC Values

```typescript
import { BitcoinUtils } from '@btc-vision/transaction';

// Convert BTC to satoshis for transaction amounts
const amount = BitcoinUtils.btcToSatoshi(0.001);  // 100000n

// Minimum UTXO value (dust limit)
const dust = BitcoinUtils.btcToSatoshi(0.0000033); // 330n
```

### Generating Random Salt for Mining

```typescript
// Generate a random salt for epoch mining
const salt = BitcoinUtils.getSafeRandomValues(32);

// Generate random bytes for a contract deployment salt
const contractSalt = BitcoinUtils.rndBytes(); // 64 bytes
```

### Validating Hex Input

```typescript
const userInput = 'abcdef1234567890';

if (BitcoinUtils.isValidHex(userInput)) {
    // Safe to use as hex
    console.log('Valid hex string');
} else {
    console.error('Invalid hex characters');
}
```

### Hashing Data for OPNet

```typescript
const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
const hash = BitcoinUtils.opnetHash(data);

console.log(hash);         // '0x...' (130 characters)
console.log(hash.length);  // 130 (2 for '0x' + 128 hex digits)
```

---

## Related Documentation

- [BufferHelper](./buffer-helper.md) -- Uint8Array and bigint conversion utilities
- [Types and Constants](./types-and-constants.md) -- Type aliases and byte length constants
