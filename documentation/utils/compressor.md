# Compressor

Bytecode compression and decompression using gzip.

## Overview

`Compressor` is a static utility class that compresses and decompresses data using gzip (compression level 9). It is used automatically during smart contract deployment to reduce the size of contract bytecode stored in Bitcoin transactions, and during calldata generation to compress public key witness data when the compressed form is smaller.

The class has a maximum output size limit of 16 MB to prevent memory exhaustion during decompression.

OPNet uses different compression implementations depending on the runtime environment:
- **Node.js:** Uses the built-in `zlib` module (`zlib.gzipSync` / `zlib.gunzipSync`).
- **Browser:** Uses the `pako` library via a browser shim (`src/shims/zlib-browser.js`).

Both implementations produce identical gzip output, ensuring cross-environment compatibility.

**Source:** `src/bytecode/Compressor.ts`

## Table of Contents

- [Import](#import)
- [Configuration](#configuration)
- [Methods](#methods)
  - [compress](#compress)
  - [decompress](#decompress)
- [Browser vs Node.js](#browser-vs-nodejs)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Import

```typescript
import { Compressor } from '@btc-vision/transaction';
```

---

## Configuration

| Option | Value | Description |
|--------|-------|-------------|
| Compression level | `9` | Maximum compression (slowest but smallest output). |
| Max output length | `16 MB` | `1024 * 1024 * 16` bytes. Decompression of data exceeding this limit will throw. |

---

## Methods

### compress

```typescript
static compress(data: Uint8Array): Uint8Array
```

Compresses data using gzip at maximum compression level (9).

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Uint8Array` | The data to compress. |

**Returns:** `Uint8Array` -- The gzip-compressed data.

```typescript
const compressed = Compressor.compress(bytecode);
console.log(`Original: ${bytecode.length} bytes`);
console.log(`Compressed: ${compressed.length} bytes`);
console.log(`Ratio: ${(compressed.length / bytecode.length * 100).toFixed(1)}%`);
```

### decompress

```typescript
static decompress(data: Uint8Array): Uint8Array
```

Decompresses gzip-compressed data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Uint8Array` | The gzip-compressed data. |

**Returns:** `Uint8Array` -- The decompressed data.

**Throws:** Error if the decompressed output exceeds 16 MB or the data is not valid gzip.

```typescript
const original = Compressor.decompress(compressed);
```

---

## Browser vs Node.js

The `Compressor` class imports `zlib` at the top of the file. In browser builds, the bundler replaces this import with a shim (`src/shims/zlib-browser.js`) that uses the `pako` library:

| Environment | Module | Functions |
|-------------|--------|-----------|
| **Node.js** | `zlib` (built-in) | `zlib.gzipSync()`, `zlib.gunzipSync()` |
| **Browser** | `pako` (via shim) | `pako.gzip()`, `pako.ungzip()` |

The shim exposes the same API (`gzipSync`, `gunzipSync`) so the `Compressor` class works identically in both environments. The bundler alias is configured in the build system to swap `zlib` for the browser shim automatically.

**Browser shim implementation:**

```javascript
import pako from 'pako';

export function gzipSync(data, options = {}) {
    return new Uint8Array(pako.gzip(data, { level: options.level || 6 }));
}

export function gunzipSync(data) {
    return new Uint8Array(pako.ungzip(data));
}
```

---

## Examples

### Compressing Contract Bytecode for Deployment

```typescript
import { Compressor, DeploymentGenerator } from '@btc-vision/transaction';

// Read contract bytecode (e.g., from a .wasm file)
const bytecode = new Uint8Array(/* ... */);

// Compress before embedding in the transaction
const compressed = Compressor.compress(bytecode);
console.log(`Compressed ${bytecode.length} -> ${compressed.length} bytes`);

// The DeploymentGenerator receives the compressed bytecode
const generator = new DeploymentGenerator(pubkey, saltPubKey, network);
const script = generator.compile(compressed, salt, challenge, maxPriority);
```

### Round-Trip Compression

```typescript
import { Compressor } from '@btc-vision/transaction';

const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const compressed = Compressor.compress(original);
const decompressed = Compressor.decompress(compressed);

// Verify round-trip
console.log(original.length === decompressed.length);  // true
for (let i = 0; i < original.length; i++) {
    console.log(original[i] === decompressed[i]);      // true for all
}
```

### Checking if Compression Saves Space

```typescript
import { Compressor } from '@btc-vision/transaction';

// Sometimes compression makes data larger (e.g., already compressed or very small data)
const data = new Uint8Array([1, 2, 3]);
const compressed = Compressor.compress(data);

if (compressed.length < data.length) {
    console.log('Compression saved space');
    // Use compressed data
} else {
    console.log('Compression did not help');
    // Use original data
}
```

This pattern is used in `CalldataGenerator.getPubKeyAsBuffer()`, where public keys are only compressed if the result is actually smaller.

---

## Related Documentation

- [Generators](../generators/generators.md) -- Script generators that use compression for bytecode and witness data
- [Transaction Building](../transaction-building.md) -- How compressed bytecode is included in deployment transactions
