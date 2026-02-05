import { describe, expect, it, vi } from 'vitest';
import { FastMap } from '../src/index.js';

describe('FastMap<bigint, bigint> - Comprehensive Tests', () => {
    describe('Constructor', () => {
        it('should create an empty map with no parameters', () => {
            const map = new FastMap<bigint, bigint>();
            expect(map.size).toBe(0);
        });

        it('should create an empty map with null parameter', () => {
            const map = new FastMap<bigint, bigint>(null);
            expect(map.size).toBe(0);
        });

        it('should create an empty map with undefined parameter', () => {
            const map = new FastMap<bigint, bigint>(undefined);
            expect(map.size).toBe(0);
        });

        it('should create a map from an array of tuples', () => {
            const entries: ReadonlyArray<readonly [bigint, bigint]> = [
                [1n, 100n],
                [2n, 200n],
                [3n, 300n],
            ];
            const map = new FastMap<bigint, bigint>(entries);

            expect(map.size).toBe(3);
            expect(map.get(1n)).toBe(100n);
            expect(map.get(2n)).toBe(200n);
            expect(map.get(3n)).toBe(300n);
        });

        it('should create a map from an empty array', () => {
            const map = new FastMap<bigint, bigint>([]);
            expect(map.size).toBe(0);
        });

        it('should create a map from another FastMap<bigint, bigint> instance', () => {
            const original = new FastMap<bigint, bigint>([
                [10n, 1000n],
                [20n, 2000n],
            ]);
            const copy = new FastMap<bigint, bigint>(original);

            expect(copy.size).toBe(2);
            expect(copy.get(10n)).toBe(1000n);
            expect(copy.get(20n)).toBe(2000n);
        });

        it('should create an independent copy when constructed from another FastMap<bigint, bigint>', () => {
            const original = new FastMap<bigint, bigint>([[1n, 100n]]);
            const copy = new FastMap<bigint, bigint>(original);

            // Modify original
            original.set(1n, 999n);
            original.set(2n, 200n);

            // Copy should remain unchanged
            expect(copy.get(1n)).toBe(100n);
            expect(copy.has(2n)).toBe(false);
            expect(copy.size).toBe(1);
        });

        it('should handle duplicate keys in initial array (last value wins)', () => {
            const entries: ReadonlyArray<readonly [bigint, bigint]> = [
                [1n, 100n],
                [1n, 200n],
                [1n, 300n],
            ];
            const map = new FastMap<bigint, bigint>(entries);

            expect(map.size).toBe(1);
            expect(map.get(1n)).toBe(300n);
        });
    });

    describe('size property', () => {
        it('should return 0 for empty map', () => {
            const map = new FastMap<bigint, bigint>();
            expect(map.size).toBe(0);
        });

        it('should return correct size after adding elements', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, 100n);
            expect(map.size).toBe(1);

            map.set(2n, 200n);
            expect(map.size).toBe(2);

            map.set(3n, 300n);
            expect(map.size).toBe(3);
        });

        it('should not increase size when updating existing key', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, 100n);
            expect(map.size).toBe(1);

            map.set(1n, 200n);
            expect(map.size).toBe(1);
        });

        it('should decrease size after deletion', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            expect(map.size).toBe(2);

            map.delete(1n);
            expect(map.size).toBe(1);
        });

        it('should be 0 after clear', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            map.clear();
            expect(map.size).toBe(0);
        });
    });

    describe('set method', () => {
        it('should add a new key-value pair', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, 100n);

            expect(map.has(1n)).toBe(true);
            expect(map.get(1n)).toBe(100n);
        });

        it('should update an existing key', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, 100n);
            map.set(1n, 200n);

            expect(map.size).toBe(1);
            expect(map.get(1n)).toBe(200n);
        });

        it('should return this for chaining', () => {
            const map = new FastMap<bigint, bigint>();
            const result = map.set(1n, 100n);

            expect(result).toBe(map);
        });

        it('should allow method chaining', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, 100n).set(2n, 200n).set(3n, 300n);

            expect(map.size).toBe(3);
            expect(map.get(1n)).toBe(100n);
            expect(map.get(2n)).toBe(200n);
            expect(map.get(3n)).toBe(300n);
        });

        it('should handle negative bigint keys', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(-1n, 100n);
            map.set(-999999999999999999n, 200n);

            expect(map.get(-1n)).toBe(100n);
            expect(map.get(-999999999999999999n)).toBe(200n);
        });

        it('should handle very large bigint keys', () => {
            const map = new FastMap<bigint, bigint>();
            const largeKey = 12345678901234567890123456789012345678901234567890n;
            map.set(largeKey, 100n);

            expect(map.has(largeKey)).toBe(true);
            expect(map.get(largeKey)).toBe(100n);
        });

        it('should handle zero as key', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(0n, 100n);

            expect(map.has(0n)).toBe(true);
            expect(map.get(0n)).toBe(100n);
        });

        it('should handle negative values', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, -100n);

            expect(map.get(1n)).toBe(-100n);
        });

        it('should handle zero as value', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, 0n);

            expect(map.get(1n)).toBe(0n);
        });
    });

    describe('get method', () => {
        it('should return the value for an existing key', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            expect(map.get(1n)).toBe(100n);
        });

        it('should return undefined for a non-existing key', () => {
            const map = new FastMap<bigint, bigint>();
            expect(map.get(1n)).toBeUndefined();
        });

        it('should return undefined for key in empty map', () => {
            const map = new FastMap<bigint, bigint>();
            expect(map.get(999n)).toBeUndefined();
        });

        it('should return correct value after update', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, 100n);
            map.set(1n, 200n);

            expect(map.get(1n)).toBe(200n);
        });

        it('should return undefined for deleted key', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            map.delete(1n);

            expect(map.get(1n)).toBeUndefined();
        });
    });

    describe('has method', () => {
        it('should return true for existing key', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            expect(map.has(1n)).toBe(true);
        });

        it('should return false for non-existing key', () => {
            const map = new FastMap<bigint, bigint>();
            expect(map.has(1n)).toBe(false);
        });

        it('should return false after key is deleted', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            map.delete(1n);

            expect(map.has(1n)).toBe(false);
        });

        it('should return false after clear', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            map.clear();

            expect(map.has(1n)).toBe(false);
        });

        it('should distinguish between different keys', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);

            expect(map.has(1n)).toBe(true);
            expect(map.has(2n)).toBe(false);
            expect(map.has(-1n)).toBe(false);
        });
    });

    describe('delete method', () => {
        it('should delete an existing key and return true', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            const result = map.delete(1n);

            expect(result).toBe(true);
            expect(map.has(1n)).toBe(false);
            expect(map.size).toBe(0);
        });

        it('should return false for non-existing key', () => {
            const map = new FastMap<bigint, bigint>();
            const result = map.delete(1n);

            expect(result).toBe(false);
        });

        it('should return false when deleting from empty map', () => {
            const map = new FastMap<bigint, bigint>();
            expect(map.delete(999n)).toBe(false);
        });

        it('should only delete the specified key', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
                [3n, 300n],
            ]);
            map.delete(2n);

            expect(map.has(1n)).toBe(true);
            expect(map.has(2n)).toBe(false);
            expect(map.has(3n)).toBe(true);
            expect(map.size).toBe(2);
        });

        it('should maintain insertion order after deletion', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
                [3n, 300n],
            ]);
            map.delete(2n);

            const keys = [...map.keys()];
            expect(keys).toEqual([1n, 3n]);
        });

        it('should return false when deleting already deleted key', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            map.delete(1n);

            expect(map.delete(1n)).toBe(false);
        });
    });

    describe('clear method', () => {
        it('should remove all entries', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
                [3n, 300n],
            ]);
            map.clear();

            expect(map.size).toBe(0);
            expect(map.has(1n)).toBe(false);
            expect(map.has(2n)).toBe(false);
            expect(map.has(3n)).toBe(false);
        });

        it('should work on empty map', () => {
            const map = new FastMap<bigint, bigint>();
            map.clear();

            expect(map.size).toBe(0);
        });

        it('should allow adding entries after clear', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            map.clear();
            map.set(2n, 200n);

            expect(map.size).toBe(1);
            expect(map.get(2n)).toBe(200n);
        });
    });

    describe('setAll method', () => {
        it('should copy all entries from another map', () => {
            const source = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const target = new FastMap<bigint, bigint>();
            target.setAll(source);

            expect(target.size).toBe(2);
            expect(target.get(1n)).toBe(100n);
            expect(target.get(2n)).toBe(200n);
        });

        it('should replace all existing entries', () => {
            const source = new FastMap<bigint, bigint>([[1n, 100n]]);
            const target = new FastMap<bigint, bigint>([
                [2n, 200n],
                [3n, 300n],
            ]);
            target.setAll(source);

            expect(target.size).toBe(1);
            expect(target.get(1n)).toBe(100n);
            expect(target.has(2n)).toBe(false);
            expect(target.has(3n)).toBe(false);
        });

        it('should create independent copy (modifications to source do not affect target)', () => {
            const source = new FastMap<bigint, bigint>([[1n, 100n]]);
            const target = new FastMap<bigint, bigint>();
            target.setAll(source);

            source.set(1n, 999n);
            source.set(2n, 200n);

            expect(target.get(1n)).toBe(100n);
            expect(target.has(2n)).toBe(false);
        });

        it('should handle empty source map', () => {
            const source = new FastMap<bigint, bigint>();
            const target = new FastMap<bigint, bigint>([[1n, 100n]]);
            target.setAll(source);

            expect(target.size).toBe(0);
        });
    });

    describe('addAll method', () => {
        it('should add all entries from another map', () => {
            const source = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const target = new FastMap<bigint, bigint>();
            target.addAll(source);

            expect(target.size).toBe(2);
            expect(target.get(1n)).toBe(100n);
            expect(target.get(2n)).toBe(200n);
        });

        it('should merge with existing entries', () => {
            const source = new FastMap<bigint, bigint>([
                [2n, 200n],
                [3n, 300n],
            ]);
            const target = new FastMap<bigint, bigint>([[1n, 100n]]);
            target.addAll(source);

            expect(target.size).toBe(3);
            expect(target.get(1n)).toBe(100n);
            expect(target.get(2n)).toBe(200n);
            expect(target.get(3n)).toBe(300n);
        });

        it('should overwrite existing keys with values from source', () => {
            const source = new FastMap<bigint, bigint>([[1n, 999n]]);
            const target = new FastMap<bigint, bigint>([[1n, 100n]]);
            target.addAll(source);

            expect(target.size).toBe(1);
            expect(target.get(1n)).toBe(999n);
        });

        it('should handle empty source map', () => {
            const source = new FastMap<bigint, bigint>();
            const target = new FastMap<bigint, bigint>([[1n, 100n]]);
            target.addAll(source);

            expect(target.size).toBe(1);
            expect(target.get(1n)).toBe(100n);
        });

        it('should preserve insertion order (existing keys first, then new keys)', () => {
            const source = new FastMap<bigint, bigint>([
                [2n, 200n],
                [3n, 300n],
            ]);
            const target = new FastMap<bigint, bigint>([[1n, 100n]]);
            target.addAll(source);

            const keys = [...target.keys()];
            expect(keys).toEqual([1n, 2n, 3n]);
        });
    });

    describe('entries method', () => {
        it('should return an iterator of [key, value] pairs', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const entries = [...map.entries()];

            expect(entries).toEqual([
                [1n, 100n],
                [2n, 200n],
            ]);
        });

        it('should return empty iterator for empty map', () => {
            const map = new FastMap<bigint, bigint>();
            const entries = [...map.entries()];

            expect(entries).toEqual([]);
        });

        it('should iterate in insertion order', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(3n, 300n);
            map.set(1n, 100n);
            map.set(2n, 200n);

            const entries = [...map.entries()];
            expect(entries).toEqual([
                [3n, 300n],
                [1n, 100n],
                [2n, 200n],
            ]);
        });

        it('should be usable with for...of loop', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const collected: [bigint, bigint][] = [];

            for (const entry of map.entries()) {
                collected.push(entry);
            }

            expect(collected).toEqual([
                [1n, 100n],
                [2n, 200n],
            ]);
        });
    });

    describe('keys method', () => {
        it('should return an iterator of keys', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
                [3n, 300n],
            ]);
            const keys = [...map.keys()];

            expect(keys).toEqual([1n, 2n, 3n]);
        });

        it('should return empty iterator for empty map', () => {
            const map = new FastMap<bigint, bigint>();
            const keys = [...map.keys()];

            expect(keys).toEqual([]);
        });

        it('should iterate in insertion order', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(5n, 500n);
            map.set(1n, 100n);
            map.set(3n, 300n);

            const keys = [...map.keys()];
            expect(keys).toEqual([5n, 1n, 3n]);
        });

        it('should be usable with for...of loop', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const collected: bigint[] = [];

            for (const key of map.keys()) {
                collected.push(key);
            }

            expect(collected).toEqual([1n, 2n]);
        });
    });

    describe('values method', () => {
        it('should return an iterator of values', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
                [3n, 300n],
            ]);
            const values = [...map.values()];

            expect(values).toEqual([100n, 200n, 300n]);
        });

        it('should return empty iterator for empty map', () => {
            const map = new FastMap<bigint, bigint>();
            const values = [...map.values()];

            expect(values).toEqual([]);
        });

        it('should iterate in insertion order', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(3n, 300n);
            map.set(1n, 100n);
            map.set(2n, 200n);

            const values = [...map.values()];
            expect(values).toEqual([300n, 100n, 200n]);
        });

        it('should be usable with for...of loop', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const collected: bigint[] = [];

            for (const value of map.values()) {
                collected.push(value);
            }

            expect(collected).toEqual([100n, 200n]);
        });
    });

    describe('forEach method', () => {
        it('should call callback for each entry', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const callback = vi.fn();

            map.forEach(callback);

            expect(callback).toHaveBeenCalledTimes(2);
            expect(callback).toHaveBeenNthCalledWith(1, 100n, 1n, map);
            expect(callback).toHaveBeenNthCalledWith(2, 200n, 2n, map);
        });

        it('should not call callback for empty map', () => {
            const map = new FastMap<bigint, bigint>();
            const callback = vi.fn();

            map.forEach(callback);

            expect(callback).not.toHaveBeenCalled();
        });

        it('should iterate in insertion order', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(3n, 300n);
            map.set(1n, 100n);
            map.set(2n, 200n);

            const order: bigint[] = [];
            map.forEach((_value, key) => {
                order.push(key);
            });

            expect(order).toEqual([3n, 1n, 2n]);
        });

        it('should use thisArg when provided', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            const context = { multiplier: 2n };

            let result: bigint = 0n;
            map.forEach(function (this: { multiplier: bigint }, value) {
                result = value * this.multiplier;
            }, context);

            expect(result).toBe(200n);
        });

        it('should work without thisArg', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            let sum = 0n;

            map.forEach((value) => {
                sum += value;
            });

            expect(sum).toBe(100n);
        });

        it('should pass map as third argument', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);
            let receivedMap: FastMap<bigint, bigint> | null = null;

            map.forEach((_value, _key, m) => {
                receivedMap = m;
            });

            expect(receivedMap).toBe(map);
        });
    });

    describe('Symbol.iterator', () => {
        it('should make map iterable with for...of', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const collected: [bigint, bigint][] = [];

            for (const entry of map) {
                collected.push(entry);
            }

            expect(collected).toEqual([
                [1n, 100n],
                [2n, 200n],
            ]);
        });

        it('should return same iterator as entries()', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);

            const fromIterator = [...map];
            const fromEntries = [...map.entries()];

            expect(fromIterator).toEqual(fromEntries);
        });

        it('should work with spread operator', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const entries = [...map];

            expect(entries).toEqual([
                [1n, 100n],
                [2n, 200n],
            ]);
        });

        it('should work with Array.from', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const entries = Array.from(map);

            expect(entries).toEqual([
                [1n, 100n],
                [2n, 200n],
            ]);
        });

        it('should work with destructuring', () => {
            const map = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);
            const [first, second] = map;

            expect(first).toEqual([1n, 100n]);
            expect(second).toEqual([2n, 200n]);
        });

        it('should return empty iterator for empty map', () => {
            const map = new FastMap<bigint, bigint>();
            const entries = [...map];

            expect(entries).toEqual([]);
        });
    });

    describe('Insertion order preservation', () => {
        it('should maintain insertion order across all iteration methods', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(5n, 500n);
            map.set(1n, 100n);
            map.set(3n, 300n);
            map.set(2n, 200n);
            map.set(4n, 400n);

            const keysFromKeys = [...map.keys()];
            const keysFromEntries = [...map.entries()].map(([k]) => k);
            const keysFromForEach: bigint[] = [];
            map.forEach((_, key) => keysFromForEach.push(key));
            const keysFromIterator = [...map].map(([k]) => k);

            const expectedOrder = [5n, 1n, 3n, 2n, 4n];

            expect(keysFromKeys).toEqual(expectedOrder);
            expect(keysFromEntries).toEqual(expectedOrder);
            expect(keysFromForEach).toEqual(expectedOrder);
            expect(keysFromIterator).toEqual(expectedOrder);
        });

        it('should not change order when updating existing key', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(1n, 100n);
            map.set(2n, 200n);
            map.set(3n, 300n);

            // Update middle key
            map.set(2n, 999n);

            const keys = [...map.keys()];
            expect(keys).toEqual([1n, 2n, 3n]);
            expect(map.get(2n)).toBe(999n);
        });
    });

    describe('Edge cases', () => {
        it('should handle maximum safe bigint values', () => {
            const map = new FastMap<bigint, bigint>();
            const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
            const minSafe = BigInt(Number.MIN_SAFE_INTEGER);

            map.set(maxSafe, 1n);
            map.set(minSafe, 2n);

            expect(map.get(maxSafe)).toBe(1n);
            expect(map.get(minSafe)).toBe(2n);
        });

        it('should handle extremely large bigints', () => {
            const map = new FastMap<bigint, bigint>();
            const hugeKey = 10n ** 100n;
            const hugeValue = 10n ** 200n;

            map.set(hugeKey, hugeValue);

            expect(map.get(hugeKey)).toBe(hugeValue);
        });

        it('should handle many entries', () => {
            const map = new FastMap<bigint, bigint>();
            const count = 10000;

            for (let i = 0; i < count; i++) {
                map.set(BigInt(i), BigInt(i * 10));
            }

            expect(map.size).toBe(count);
            expect(map.get(0n)).toBe(0n);
            expect(map.get(5000n)).toBe(50000n);
            expect(map.get(9999n)).toBe(99990n);
        });

        it('should correctly handle 0n as both key and value', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(0n, 0n);

            expect(map.has(0n)).toBe(true);
            expect(map.get(0n)).toBe(0n);
            expect(map.size).toBe(1);
        });

        it('should handle negative zero (-0n is same as 0n in bigint)', () => {
            const map = new FastMap<bigint, bigint>();
            map.set(-0n, 100n);

            expect(map.get(0n)).toBe(100n);
            expect(map.has(-0n)).toBe(true);
        });

        it('should handle operations in sequence', () => {
            const map = new FastMap<bigint, bigint>();

            // Add
            map.set(1n, 100n);
            map.set(2n, 200n);
            expect(map.size).toBe(2);

            // Update
            map.set(1n, 150n);
            expect(map.get(1n)).toBe(150n);
            expect(map.size).toBe(2);

            // Delete
            map.delete(1n);
            expect(map.size).toBe(1);
            expect(map.has(1n)).toBe(false);

            // Add back
            map.set(1n, 100n);
            expect(map.size).toBe(2);

            // Clear
            map.clear();
            expect(map.size).toBe(0);

            // Add after clear
            map.set(3n, 300n);
            expect(map.size).toBe(1);
            expect(map.get(3n)).toBe(300n);
        });
    });

    describe('Type safety and method signatures', () => {
        it('set should accept bigint key and bigint value', () => {
            const map = new FastMap<bigint, bigint>();
            const result = map.set(1n, 100n);

            expect(result).toBeInstanceOf(FastMap<bigint, bigint>);
        });

        it('get should return bigint or undefined', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);

            const existing: bigint | undefined = map.get(1n);
            const nonExisting: bigint | undefined = map.get(999n);

            expect(typeof existing).toBe('bigint');
            expect(nonExisting).toBeUndefined();
        });

        it('has should return boolean', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);

            expect(typeof map.has(1n)).toBe('boolean');
            expect(typeof map.has(999n)).toBe('boolean');
        });

        it('delete should return boolean', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);

            expect(typeof map.delete(1n)).toBe('boolean');
            expect(typeof map.delete(999n)).toBe('boolean');
        });

        it('size should return number', () => {
            const map = new FastMap<bigint, bigint>([[1n, 100n]]);

            expect(typeof map.size).toBe('number');
        });
    });
});
