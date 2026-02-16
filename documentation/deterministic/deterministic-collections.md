# Deterministic Collections

Deterministic and high-performance collection types for OPNet consensus-critical code.

## Overview

OPNet requires that all nodes produce identical results when processing the same data. Standard JavaScript `Map` and `Set` do not guarantee a specific iteration order across different engines or runs. The deterministic collection classes in this module solve that problem by maintaining sorted key order (for `DeterministicMap` and `DeterministicSet`) or insertion order (for `FastMap`, `AddressMap`, and `ExtendedAddressMap`).

All collections implement the `Disposable` interface and can be used with the `using` keyword for automatic cleanup.

**Source:** `src/deterministic/`

## Table of Contents

- [Collection Overview](#collection-overview)
- [DeterministicMap](#deterministicmap)
- [DeterministicSet](#deterministicset)
- [FastMap](#fastmap)
- [CustomMap](#custommap)
- [AddressMap](#addressmap)
- [ExtendedAddressMap](#extendedaddressmap)
- [AddressSet](#addressset)
- [Why Deterministic Collections Matter](#why-deterministic-collections-matter)
- [Common API Reference](#common-api-reference)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Collection Overview

| Collection | Key Type | Ordering | Use Case |
|-----------|----------|----------|----------|
| `DeterministicMap<K, V>` | `PropertyExtendedKey` | Sorted by comparator | Consensus-critical maps where iteration order must be identical across all nodes. |
| `DeterministicSet<T>` | Any (with comparator) | Sorted by comparator | Consensus-critical sets with guaranteed iteration order. |
| `FastMap<K, V>` | `PropertyExtendedKey` | Insertion order | High-performance map using plain object storage. Supports `string`, `number`, `symbol`, and `bigint` keys. |
| `CustomMap<K, V>` | Any | Hash-based (open addressing) | General-purpose hash map with custom hashing for all types including `Uint8Array`, `bigint`, and `Date`. |
| `AddressMap<V>` | `Address` | Insertion order | Maps keyed by OPNet `Address`, using the ML-DSA hash (`toBigInt()`) for internal storage. |
| `ExtendedAddressMap<V>` | `Address` | Insertion order | Maps keyed by OPNet `Address`, using the tweaked public key (`tweakedToBigInt()`) for lookup. |
| `AddressSet` | `Address` | Insertion order | Sets of OPNet `Address` values with deduplication by ML-DSA hash. |

---

## DeterministicMap

A sorted map that guarantees identical iteration order for the same set of key-value pairs, regardless of insertion order. Uses binary search for O(log n) insertion and lookup in the sorted key array.

**Source:** `src/deterministic/DeterministicMap.ts`

```typescript
import { DeterministicMap } from '@btc-vision/transaction';

// String keys, sorted lexicographically
const map = new DeterministicMap<string, number>((a, b) => a.localeCompare(b));

map.set('charlie', 3);
map.set('alpha', 1);
map.set('bravo', 2);

// Iteration is always in sorted order: alpha, bravo, charlie
for (const [key, value] of map) {
    console.log(`${key}: ${value}`);
}
```

### Constructor

```typescript
new DeterministicMap<K, V>(compareFn: (a: K, b: K) => number)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `compareFn` | `(a: K, b: K) => number` | Comparison function. Returns negative if `a < b`, zero if `a === b`, positive if `a > b`. |

### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `fromMap(map, compareFn)` | `DeterministicMap<K, V>` | Creates a `DeterministicMap` from an existing `FastMap`. |

### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `set(key, value)` | `void` | Inserts or updates a key-value pair. Maintains sorted order via binary search. |
| `get(key)` | `V \| undefined` | Returns the value for the key, or `undefined`. |
| `has(key)` | `boolean` | Returns `true` if the key exists. |
| `delete(key)` | `boolean` | Removes a key-value pair. Returns `true` if the key existed. |
| `clear()` | `void` | Removes all entries. |
| `entries()` | `IterableIterator<[K, V]>` | Yields entries in sorted key order. |
| `keys()` | `IterableIterator<K>` | Yields keys in sorted order. |
| `values()` | `IterableIterator<V>` | Yields values in sorted key order. |
| `forEach(callback)` | `void` | Calls `callback(value, key, map)` for each entry in sorted order. |
| `[Symbol.iterator]()` | `IterableIterator<[K, V]>` | Same as `entries()`. |
| `[Symbol.dispose]()` | `void` | Calls `clear()`. |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `size` | `number` | The number of entries in the map. |

---

## DeterministicSet

A sorted set that guarantees identical iteration order regardless of insertion order. Uses binary search for O(log n) operations.

**Source:** `src/deterministic/DeterministicSet.ts`

```typescript
import { DeterministicSet } from '@btc-vision/transaction';

const set = new DeterministicSet<number>((a, b) => a - b);

set.add(30);
set.add(10);
set.add(20);

// Always iterates: 10, 20, 30
for (const value of set) {
    console.log(value);
}
```

### Constructor

```typescript
new DeterministicSet<T>(compareFn: (a: T, b: T) => number)
```

### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `fromSet(set, compareFn)` | `DeterministicSet<T>` | Creates a `DeterministicSet` from a standard `Set`. |

### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `add(value)` | `void` | Adds a value if not already present. Maintains sorted order. |
| `delete(value)` | `boolean` | Removes a value. Returns `true` if it existed. |
| `has(value)` | `boolean` | Returns `true` if the value exists. |
| `clear()` | `void` | Removes all elements. |
| `forEach(callback)` | `void` | Calls `callback(value, set)` for each element in sorted order. |
| `values()` | `IterableIterator<T>` | Yields values in sorted order. |
| `[Symbol.iterator]()` | `IterableIterator<T>` | Same as `values()`. |
| `[Symbol.dispose]()` | `void` | Calls `clear()`. |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `size` | `number` | The number of elements in the set. |

---

## FastMap

A high-performance map that uses a plain JavaScript object (`{}`) for O(1) lookups. Keys are stored in insertion order. Supports `string`, `number`, `symbol`, and `bigint` keys (bigint keys are auto-converted to strings by JavaScript).

**Source:** `src/deterministic/FastMap.ts`

```typescript
import { FastMap } from '@btc-vision/transaction';

const map = new FastMap<bigint, string>();
map.set(1n, 'one');
map.set(2n, 'two');
map.set(3n, 'three');

console.log(map.get(2n));  // 'two'
console.log(map.size);     // 3
```

### Constructor

```typescript
new FastMap<K, V>(iterable?: ReadonlyArray<readonly [K, V]> | null | FastMap<K, V>)
```

Can be initialized from an array of tuples or another `FastMap`.

### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `set(key, value)` | `this` | Inserts or updates a key-value pair. |
| `get(key)` | `V \| undefined` | Returns the value for the key. |
| `has(key)` | `boolean` | Returns `true` if the key exists. |
| `delete(key)` | `boolean` | Removes a key-value pair. |
| `clear()` | `void` | Removes all entries. |
| `indexOf(key)` | `number` | Returns the insertion index of the key, or `-1`. |
| `setAll(map)` | `void` | Replaces all entries with those from another `FastMap`. |
| `addAll(map)` | `void` | Adds all entries from another `FastMap`. |
| `entries()` | `IterableIterator<[K, V]>` | Yields entries in insertion order. |
| `keys()` | `IterableIterator<K>` | Yields keys in insertion order. |
| `values()` | `IterableIterator<V>` | Yields values in insertion order. |
| `forEach(callback)` | `void` | Calls `callback(value, key, map)` for each entry. |
| `[Symbol.iterator]()` | `IterableIterator<[K, V]>` | Same as `entries()`. |
| `[Symbol.dispose]()` | `void` | Calls `clear()`. |

---

## CustomMap

A general-purpose hash map using open addressing with linear probing. Supports any key type including `Uint8Array`, `bigint`, `Date`, arrays, and primitives. Uses FNV-1a hashing for strings, bigints, and buffers.

**Source:** `src/deterministic/CustomMap.ts`

```typescript
import { CustomMap } from '@btc-vision/transaction';

const map = new CustomMap<Uint8Array, string>();
map.set(new Uint8Array([1, 2, 3]), 'hello');
map.set(new Uint8Array([4, 5, 6]), 'world');

console.log(map.get(new Uint8Array([1, 2, 3])));  // 'hello'
```

### Key Features

- **Custom hashing:** FNV-1a for strings and byte sequences, optimized paths for numbers and bigints.
- **Deep equality:** `Uint8Array` and `ArrayBuffer` keys are compared by content, not reference.
- **Auto-resize:** The internal table resizes at 75% load factor (doubles capacity).
- **Initial capacity:** 16 slots.

### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `set(key, value)` | `boolean` | Inserts or updates. Returns `true` if the key already existed. |
| `get(key)` | `V \| undefined` | Returns the value for the key. |
| `has(key)` | `boolean` | Returns `true` if the key exists. |
| `delete(key)` | `boolean` | Removes a key-value pair. |
| `clear()` | `void` | Removes all entries and resets capacity. |
| `indexOf(key)` | `number` | Returns the internal hash index, or `-1`. |
| `entries()` | `MapIterator<[K, V]>` | Yields entries. |
| `keys()` | `MapIterator<K>` | Yields keys. |
| `values()` | `MapIterator<V>` | Yields values. |
| `[Symbol.iterator]()` | `MapIterator<[K, V]>` | Same as `entries()`. |
| `[Symbol.dispose]()` | `void` | Calls `clear()`. |

---

## AddressMap

A map keyed by OPNet `Address`, using the ML-DSA hash (`address.toBigInt()`) as the internal key. Stores values in a `FastMap<bigint, V>` for O(1) lookups.

**Source:** `src/deterministic/AddressMap.ts`

```typescript
import { AddressMap, Address } from '@btc-vision/transaction';

const balances = new AddressMap<bigint>();
balances.set(address1, 1000000n);
balances.set(address2, 2000000n);

console.log(balances.get(address1));  // 1000000n
console.log(balances.size);           // 2

for (const [addr, balance] of balances) {
    console.log(`${addr.toHex()}: ${balance}`);
}
```

### Constructor

```typescript
new AddressMap<V>(iterable?: ReadonlyArray<readonly [Address, V]> | null)
```

### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `set(key, value)` | `this` | Inserts or updates using the address ML-DSA hash. |
| `get(key)` | `V \| undefined` | Retrieves by address. |
| `has(key)` | `boolean` | Checks existence by ML-DSA hash. |
| `delete(key)` | `boolean` | Removes by address. |
| `clear()` | `void` | Removes all entries. |
| `indexOf(address)` | `number` | Returns the index of the address. |
| `entries()` | `IterableIterator<[Address, V]>` | Yields `[Address, V]` pairs. Note: keys are reconstructed from `bigint` via `Address.fromBigInt()`. |
| `keys()` | `IterableIterator<Address>` | Yields `Address` objects. |
| `values()` | `IterableIterator<V>` | Yields values. |
| `forEach(callback)` | `void` | Calls `callback(value, key, map)` for each entry. |
| `[Symbol.iterator]()` | `IterableIterator<[Address, V]>` | Same as `entries()`. |
| `[Symbol.dispose]()` | `void` | Calls `clear()`. |

> **Note:** Iterating `entries()` or `keys()` creates new `Address` objects from `bigint`. The reconstructed addresses will not have the classical public key set. If you need the original `Address` objects, maintain a separate reference.

---

## ExtendedAddressMap

A map keyed by OPNet `Address` using the **tweaked public key** (`address.tweakedToBigInt()`) for lookup instead of the ML-DSA hash. This is used when you need to index by both the MLDSA and classical key components.

**Source:** `src/deterministic/ExtendedAddressMap.ts`

```typescript
import { ExtendedAddressMap, Address } from '@btc-vision/transaction';

const map = new ExtendedAddressMap<string>();
map.set(address1, 'validator-a');
map.set(address2, 'validator-b');

console.log(map.get(address1));  // 'validator-a'
```

### Constructor

```typescript
new ExtendedAddressMap<V>(iterable?: ReadonlyArray<readonly [Address, V]> | null)
```

### Instance Methods

Same API as `AddressMap` but uses `tweakedToBigInt()` for key operations. The `entries()`, `keys()`, and `values()` iterators yield the original `Address` objects (not reconstructed).

| Method | Returns | Description |
|--------|---------|-------------|
| `set(key, value)` | `this` | Inserts or updates using the tweaked public key. |
| `get(key)` | `V \| undefined` | Retrieves by tweaked public key. |
| `has(key)` | `boolean` | Checks by tweaked public key. |
| `delete(key)` | `boolean` | Removes by tweaked public key. Rebuilds the internal index. |
| `clear()` | `void` | Removes all entries. |
| `indexOf(address)` | `number` | Returns the index, or `-1`. |
| `entries()` | `IterableIterator<[Address, V]>` | Yields original `[Address, V]` pairs. |
| `keys()` | `IterableIterator<Address>` | Yields original `Address` objects. |
| `values()` | `IterableIterator<V>` | Yields values. |
| `forEach(callback)` | `void` | Calls `callback(value, key, map)`. |
| `[Symbol.iterator]()` | `IterableIterator<[Address, V]>` | Same as `entries()`. |
| `[Symbol.dispose]()` | `void` | Calls `clear()`. |

---

## AddressSet

A set of OPNet `Address` values with deduplication based on the ML-DSA hash (`address.toBigInt()`). Maintains insertion order.

**Source:** `src/deterministic/AddressSet.ts`

```typescript
import { AddressSet, Address } from '@btc-vision/transaction';

const validators = new AddressSet();
validators.add(address1);
validators.add(address2);
validators.add(address1); // duplicate, ignored

console.log(validators.size);      // 2
console.log(validators.has(address1)); // true
```

### Constructor

```typescript
new AddressSet(keys?: Address[])
```

### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `add(address)` | `void` | Adds an address if not already present. |
| `has(address)` | `boolean` | Returns `true` if the address is in the set. |
| `remove(address)` | `void` | Removes an address from the set. |
| `clone()` | `AddressSet` | Returns a shallow copy. |
| `combine(set)` | `AddressSet` | Returns a new set that is the union of this set and another. |
| `clear()` | `void` | Removes all addresses. |
| `[Symbol.iterator]()` | `IterableIterator<Address>` | Yields addresses in insertion order. |
| `[Symbol.dispose]()` | `void` | Calls `clear()`. |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `size` | `number` | The number of addresses in the set. |

---

## Why Deterministic Collections Matter

In a blockchain consensus system, every node must compute the exact same result for the same input. If two nodes iterate over a map in different orders, they may produce different state roots, transaction orderings, or Merkle trees -- causing a consensus failure (fork).

Standard JavaScript `Map` iterates in insertion order, which is deterministic for identical insertion sequences. However, when entries are added in varying orders across nodes (e.g., from network messages arriving in different sequences), the iteration order diverges.

`DeterministicMap` and `DeterministicSet` solve this by sorting entries by a comparator function. Regardless of insertion order, iteration always produces the same sequence:

```typescript
// Node A inserts in one order
mapA.set('c', 3);
mapA.set('a', 1);
mapA.set('b', 2);

// Node B inserts in a different order
mapB.set('b', 2);
mapB.set('a', 1);
mapB.set('c', 3);

// Both iterate identically: a=1, b=2, c=3
```

---

## Common API Reference

All collections share these common patterns:

| Method | Description |
|--------|-------------|
| `set(key, value)` / `add(value)` | Insert or update an entry. |
| `get(key)` | Retrieve a value by key. |
| `has(key)` / `has(value)` | Check existence. |
| `delete(key)` / `remove(value)` | Remove an entry. |
| `clear()` | Remove all entries. |
| `size` | Number of entries. |
| `entries()` | Iterate key-value pairs. |
| `keys()` | Iterate keys. |
| `values()` | Iterate values. |
| `forEach(callback)` | Execute a function for each entry. |
| `[Symbol.iterator]()` | Enable `for...of` loops. |
| `[Symbol.dispose]()` | Enable `using` keyword (calls `clear()`). |

---

## Examples

### Using DeterministicMap for Consensus State

```typescript
import { DeterministicMap } from '@btc-vision/transaction';

// bigint keys sorted numerically
const storage = new DeterministicMap<bigint, bigint>((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
});

storage.set(100n, 42n);
storage.set(1n, 99n);
storage.set(50n, 7n);

// Always iterates: 1n, 50n, 100n
for (const [pointer, value] of storage) {
    console.log(`${pointer}: ${value}`);
}
```

### AddressMap for Token Balances

```typescript
import { AddressMap, Address } from '@btc-vision/transaction';

const balances = new AddressMap<bigint>();

// Set balances
balances.set(owner, 1000000000000000000n);
balances.set(spender, 500000000000000000n);

// Transfer
const fromBalance = balances.get(owner) ?? 0n;
const toBalance = balances.get(spender) ?? 0n;
const amount = 100000000000000000n;

balances.set(owner, fromBalance - amount);
balances.set(spender, toBalance + amount);
```

### Disposable Pattern

```typescript
{
    using map = new DeterministicMap<string, number>((a, b) => a.localeCompare(b));
    map.set('key', 42);
    // ... use map
} // map.clear() called automatically
```

---

## Related Documentation

- [Address](../keypair/address.md) -- The OPNet address type used as keys in AddressMap and AddressSet
- [BinaryWriter](../binary/binary-writer.md) -- Serialization methods that accept AddressMap and ExtendedAddressMap
- [Types and Constants](../utils/types-and-constants.md) -- Type aliases used throughout the codebase
