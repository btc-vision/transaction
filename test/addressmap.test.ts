import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Address, AddressMap } from '../src';

describe('AddressMap', () => {
    // Store original fromBigInt to restore later
    const originalFromBigInt = Address.fromBigInt.bind(Address);

    // Helper to create mock addresses with predictable bigint values
    const createMockAddress = (value: bigint): Address => {
        return originalFromBigInt(value);
    };

    beforeEach(() => {
        // Mock Address.fromBigInt to return a mock address
        Address.fromBigInt = vi.fn((value: bigint) => createMockAddress(value));
    });

    afterEach(() => {
        Address.fromBigInt = originalFromBigInt;
    });

    describe('constructor', () => {
        it('should create an empty map with no arguments', () => {
            const map = new AddressMap();
            expect(map.size).toBe(0);
        });

        it('should create an empty map with null', () => {
            const map = new AddressMap(null);
            expect(map.size).toBe(0);
        });

        it('should create a map from iterable', () => {
            const addr1 = createMockAddress(1n);
            const addr2 = createMockAddress(2n);

            const map = new AddressMap([
                [addr1, 'value1'],
                [addr2, 'value2'],
            ]);

            expect(map.size).toBe(2);
            expect(map.get(addr1)).toBe('value1');
            expect(map.get(addr2)).toBe('value2');
        });

        it('should handle empty iterable', () => {
            const map = new AddressMap([]);
            expect(map.size).toBe(0);
        });
    });

    describe('size', () => {
        it('should return 0 for empty map', () => {
            const map = new AddressMap();
            expect(map.size).toBe(0);
        });

        it('should return correct size after additions', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            expect(map.size).toBe(1);
            map.set(createMockAddress(2n), 'b');
            expect(map.size).toBe(2);
            map.set(createMockAddress(3n), 'c');
            expect(map.size).toBe(3);
        });

        it('should not increase size when setting existing key', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'a');
            expect(map.size).toBe(1);
            map.set(addr, 'b');
            expect(map.size).toBe(1);
        });

        it('should decrease size after deletion', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'a');
            expect(map.size).toBe(1);
            map.delete(addr);
            expect(map.size).toBe(0);
        });
    });

    describe('set', () => {
        it('should add new key-value pair', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);

            map.set(addr, 'test');

            expect(map.has(addr)).toBe(true);
            expect(map.get(addr)).toBe('test');
        });

        it('should update existing key', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);

            map.set(addr, 'first');
            map.set(addr, 'second');

            expect(map.get(addr)).toBe('second');
            expect(map.size).toBe(1);
        });

        it('should return this for chaining', () => {
            const map = new AddressMap<string>();
            const addr1 = createMockAddress(1n);
            const addr2 = createMockAddress(2n);

            const result = map.set(addr1, 'a').set(addr2, 'b');

            expect(result).toBe(map);
            expect(map.size).toBe(2);
        });

        it('should handle various value types', () => {
            const map = new AddressMap<unknown>();
            const addr1 = createMockAddress(1n);
            const addr2 = createMockAddress(2n);
            const addr3 = createMockAddress(3n);
            const addr4 = createMockAddress(4n);
            const addr5 = createMockAddress(5n);

            map.set(addr1, null);
            map.set(addr2, undefined);
            map.set(addr3, { nested: 'object' });
            map.set(addr4, [1, 2, 3]);
            map.set(addr5, () => 'function');

            expect(map.get(addr1)).toBe(null);
            expect(map.get(addr2)).toBe(undefined);
            expect(map.get(addr3)).toEqual({ nested: 'object' });
            expect(map.get(addr4)).toEqual([1, 2, 3]);
            expect(typeof map.get(addr5)).toBe('function');
        });
    });

    describe('get', () => {
        it('should return value for existing key', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'test');

            expect(map.get(addr)).toBe('test');
        });

        it('should return undefined for non-existing key', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);

            expect(map.get(addr)).toBeUndefined();
        });

        it('should return undefined after key is deleted', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'test');
            map.delete(addr);

            expect(map.get(addr)).toBeUndefined();
        });

        it('should distinguish between undefined value and missing key', () => {
            const map = new AddressMap<string | undefined>();
            const addr1 = createMockAddress(1n);
            const addr2 = createMockAddress(2n);

            map.set(addr1, undefined);

            expect(map.get(addr1)).toBeUndefined();
            expect(map.get(addr2)).toBeUndefined();
            expect(map.has(addr1)).toBe(true);
            expect(map.has(addr2)).toBe(false);
        });
    });

    describe('has', () => {
        it('should return true for existing key', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'test');

            expect(map.has(addr)).toBe(true);
        });

        it('should return false for non-existing key', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);

            expect(map.has(addr)).toBe(false);
        });

        it('should return false after key is deleted', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'test');
            map.delete(addr);

            expect(map.has(addr)).toBe(false);
        });

        it('should return true for key with undefined value', () => {
            const map = new AddressMap<string | undefined>();
            const addr = createMockAddress(1n);
            map.set(addr, undefined);

            expect(map.has(addr)).toBe(true);
        });

        it('should return true for key with null value', () => {
            const map = new AddressMap<string | null>();
            const addr = createMockAddress(1n);
            map.set(addr, null);

            expect(map.has(addr)).toBe(true);
        });
    });

    describe('delete', () => {
        it('should delete existing key and return true', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'test');

            const result = map.delete(addr);

            expect(result).toBe(true);
            expect(map.has(addr)).toBe(false);
            expect(map.size).toBe(0);
        });

        it('should return false for non-existing key', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);

            const result = map.delete(addr);

            expect(result).toBe(false);
        });

        it('should return false when deleting same key twice', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'test');

            expect(map.delete(addr)).toBe(true);
            expect(map.delete(addr)).toBe(false);
        });

        it('should not affect other keys', () => {
            const map = new AddressMap<string>();
            const addr1 = createMockAddress(1n);
            const addr2 = createMockAddress(2n);
            const addr3 = createMockAddress(3n);

            map.set(addr1, 'a');
            map.set(addr2, 'b');
            map.set(addr3, 'c');

            map.delete(addr2);

            expect(map.has(addr1)).toBe(true);
            expect(map.has(addr2)).toBe(false);
            expect(map.has(addr3)).toBe(true);
            expect(map.size).toBe(2);
        });
    });

    describe('clear', () => {
        it('should remove all entries', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');
            map.set(createMockAddress(3n), 'c');

            map.clear();

            expect(map.size).toBe(0);
        });

        it('should work on empty map', () => {
            const map = new AddressMap<string>();

            map.clear();

            expect(map.size).toBe(0);
        });

        it('should allow adding after clear', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'before');
            map.clear();
            map.set(addr, 'after');

            expect(map.get(addr)).toBe('after');
            expect(map.size).toBe(1);
        });
    });

    describe('indexOf', () => {
        it('should return index of existing key', () => {
            const map = new AddressMap<string>();
            const addr1 = createMockAddress(1n);
            const addr2 = createMockAddress(2n);
            const addr3 = createMockAddress(3n);

            map.set(addr1, 'a');
            map.set(addr2, 'b');
            map.set(addr3, 'c');

            expect(map.indexOf(addr1)).toBe(0);
            expect(map.indexOf(addr2)).toBe(1);
            expect(map.indexOf(addr3)).toBe(2);
        });

        it('should return -1 for non-existing key', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);

            expect(map.indexOf(addr)).toBe(-1);
        });

        it('should return -1 after key is deleted', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'test');
            map.delete(addr);

            expect(map.indexOf(addr)).toBe(-1);
        });

        it('should update indices after deletion', () => {
            const map = new AddressMap<string>();
            const addr1 = createMockAddress(1n);
            const addr2 = createMockAddress(2n);
            const addr3 = createMockAddress(3n);

            map.set(addr1, 'a');
            map.set(addr2, 'b');
            map.set(addr3, 'c');

            map.delete(addr1);

            expect(map.indexOf(addr2)).toBe(0);
            expect(map.indexOf(addr3)).toBe(1);
        });
    });

    describe('entries', () => {
        it('should yield all entries', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');
            map.set(createMockAddress(3n), 'c');

            const entries = [...map.entries()];

            expect(entries.length).toBe(3);
            expect(entries[0][0].toBigInt()).toBe(1n);
            expect(entries[0][1]).toBe('a');
            expect(entries[1][0].toBigInt()).toBe(2n);
            expect(entries[1][1]).toBe('b');
            expect(entries[2][0].toBigInt()).toBe(3n);
            expect(entries[2][1]).toBe('c');
        });

        it('should yield nothing for empty map', () => {
            const map = new AddressMap<string>();

            const entries = [...map.entries()];

            expect(entries).toEqual([]);
        });

        it('should maintain insertion order', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(3n), 'c');
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');

            const entries = [...map.entries()];

            expect(entries[0][0].toBigInt()).toBe(3n);
            expect(entries[1][0].toBigInt()).toBe(1n);
            expect(entries[2][0].toBigInt()).toBe(2n);
        });

        it('should create new Address instances (not references)', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');

            const entries1 = [...map.entries()];
            const entries2 = [...map.entries()];

            // Address.fromBigInt should be called for each iteration
            expect(Address.fromBigInt).toHaveBeenCalledWith(1n);
        });
    });

    describe('keys', () => {
        it('should yield all keys', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');
            map.set(createMockAddress(3n), 'c');

            const keys = [...map.keys()];

            expect(keys.length).toBe(3);
            expect(keys[0].toBigInt()).toBe(1n);
            expect(keys[1].toBigInt()).toBe(2n);
            expect(keys[2].toBigInt()).toBe(3n);
        });

        it('should yield nothing for empty map', () => {
            const map = new AddressMap<string>();

            const keys = [...map.keys()];

            expect(keys).toEqual([]);
        });

        it('should maintain insertion order', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(30n), 'c');
            map.set(createMockAddress(10n), 'a');
            map.set(createMockAddress(20n), 'b');

            const keys = [...map.keys()];

            expect(keys[0].toBigInt()).toBe(30n);
            expect(keys[1].toBigInt()).toBe(10n);
            expect(keys[2].toBigInt()).toBe(20n);
        });
    });

    describe('values', () => {
        it('should yield all values', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');
            map.set(createMockAddress(3n), 'c');

            const values = [...map.values()];

            expect(values).toEqual(['a', 'b', 'c']);
        });

        it('should yield nothing for empty map', () => {
            const map = new AddressMap<string>();

            const values = [...map.values()];

            expect(values).toEqual([]);
        });

        it('should maintain insertion order', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(3n), 'third');
            map.set(createMockAddress(1n), 'first');
            map.set(createMockAddress(2n), 'second');

            const values = [...map.values()];

            expect(values).toEqual(['third', 'first', 'second']);
        });

        it('should yield updated values', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(1n);
            map.set(addr, 'original');
            map.set(addr, 'updated');

            const values = [...map.values()];

            expect(values).toEqual(['updated']);
        });
    });

    describe('forEach', () => {
        it('should call callback for each entry', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');
            map.set(createMockAddress(3n), 'c');

            const callback = vi.fn();
            map.forEach(callback);

            expect(callback).toHaveBeenCalledTimes(3);
        });

        /*it('should pass value, key, and map to callback', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'test');

            const callback = vi.fn();
            map.forEach(callback);

            expect(callback).toHaveBeenCalledWith(
                'test',
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                expect.objectContaining({ toBigInt: expect.any(Function) }),
                map,
            );
        });*/

        it('should iterate in insertion order', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(3n), 'c');
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');

            const values: string[] = [];
            map.forEach((value) => values.push(value));

            expect(values).toEqual(['c', 'a', 'b']);
        });

        it('should not call callback for empty map', () => {
            const map = new AddressMap<string>();

            const callback = vi.fn();
            map.forEach(callback);

            expect(callback).not.toHaveBeenCalled();
        });

        it('should use thisArg as context', () => {
            const map = new AddressMap<number>();
            map.set(createMockAddress(1n), 10);
            map.set(createMockAddress(2n), 20);
            map.set(createMockAddress(3n), 30);

            const collector = {
                sum: 0,
                add(value: number) {
                    this.sum += value;
                },
            };

            map.forEach(function (this: typeof collector, value) {
                this.add(value);
            }, collector);

            expect(collector.sum).toBe(60);
        });

        it('should work without thisArg', () => {
            const map = new AddressMap<number>();
            map.set(createMockAddress(1n), 1);

            let sum = 0;
            map.forEach((value) => {
                sum += value;
            });

            expect(sum).toBe(1);
        });
    });

    describe('Symbol.iterator', () => {
        it('should be iterable with for...of', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');

            const entries: [Address, string][] = [];
            for (const entry of map) {
                entries.push(entry);
            }

            expect(entries.length).toBe(2);
            expect(entries[0][0].toBigInt()).toBe(1n);
            expect(entries[0][1]).toBe('a');
            expect(entries[1][0].toBigInt()).toBe(2n);
            expect(entries[1][1]).toBe('b');
        });

        it('should work with spread operator', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');

            const entries = [...map];

            expect(entries.length).toBe(2);
        });

        it('should work with Array.from', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');

            const entries = Array.from(map);

            expect(entries.length).toBe(1);
        });

        it('should yield same as entries()', () => {
            const map = new AddressMap<string>();
            map.set(createMockAddress(1n), 'a');
            map.set(createMockAddress(2n), 'b');

            const fromIterator = [...map];
            const fromEntries = [...map.entries()];

            expect(fromIterator.length).toBe(fromEntries.length);
            for (let i = 0; i < fromIterator.length; i++) {
                expect(fromIterator[i][0].toBigInt()).toBe(fromEntries[i][0].toBigInt());
                expect(fromIterator[i][1]).toBe(fromEntries[i][1]);
            }
        });
    });

    describe('edge cases', () => {
        it('should handle large number of entries', () => {
            const map = new AddressMap<number>();
            const count = 10000;

            for (let i = 0; i < count; i++) {
                map.set(createMockAddress(BigInt(i)), i);
            }

            expect(map.size).toBe(count);
            expect(map.get(createMockAddress(0n))).toBe(0);
            expect(map.get(createMockAddress(BigInt(count - 1)))).toBe(count - 1);
        });

        it('should handle addresses with very large bigint values', () => {
            const map = new AddressMap<string>();
            const largeBigInt = 2n ** 256n - 1n;
            const addr = createMockAddress(largeBigInt);

            map.set(addr, 'large');

            expect(map.get(addr)).toBe('large');
            expect(map.has(addr)).toBe(true);
        });

        it('should handle zero bigint value', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(0n);

            map.set(addr, 'zero');

            expect(map.get(addr)).toBe('zero');
            expect(map.has(addr)).toBe(true);
        });

        it('should handle negative bigint values', () => {
            const map = new AddressMap<string>();
            const addr = createMockAddress(-1n);

            map.set(addr, 'negative');

            expect(map.get(addr)).toBe('negative');
            expect(map.has(addr)).toBe(true);
        });

        it('should handle rapid set/delete cycles', () => {
            const map = new AddressMap<number>();
            const addr = createMockAddress(1n);

            for (let i = 0; i < 1000; i++) {
                map.set(addr, i);
                if (i % 2 === 0) {
                    map.delete(addr);
                }
            }

            // Last iteration: i=999, set to 999, 999 % 2 !== 0, so not deleted
            expect(map.get(addr)).toBe(999);
        });

        it('should handle interleaved operations', () => {
            const map = new AddressMap<string>();
            const addr1 = createMockAddress(1n);
            const addr2 = createMockAddress(2n);
            const addr3 = createMockAddress(3n);

            map.set(addr1, 'a');
            map.set(addr2, 'b');
            map.delete(addr1);
            map.set(addr3, 'c');
            map.set(addr1, 'a2');
            map.delete(addr2);

            expect(map.size).toBe(2);
            expect(map.get(addr1)).toBe('a2');
            expect(map.has(addr2)).toBe(false);
            expect(map.get(addr3)).toBe('c');

            // Check order: addr3 was added before addr1 was re-added
            const keys = [...map.keys()];
            expect(keys[0].toBigInt()).toBe(3n);
            expect(keys[1].toBigInt()).toBe(1n);
        });
    });

    describe('performance', () => {
        it('should handle bulk insertions efficiently', () => {
            const map = new AddressMap<number>();
            const start = performance.now();

            for (let i = 0; i < 50000; i++) {
                map.set(createMockAddress(BigInt(i)), i);
            }

            const duration = performance.now() - start;

            expect(map.size).toBe(50000);
            // Should complete in reasonable time (adjust threshold as needed)
            expect(duration).toBeLessThan(5000); // 5 seconds max
        });

        it('should handle bulk lookups efficiently', () => {
            const map = new AddressMap<number>();
            const count = 50000;

            for (let i = 0; i < count; i++) {
                map.set(createMockAddress(BigInt(i)), i);
            }

            const start = performance.now();

            for (let i = 0; i < count; i++) {
                map.get(createMockAddress(BigInt(i)));
            }

            const duration = performance.now() - start;

            // Should complete in reasonable time
            expect(duration).toBeLessThan(5000);
        });

        it('should handle bulk deletions efficiently', () => {
            const map = new AddressMap<number>();
            const count = 10000;

            for (let i = 0; i < count; i++) {
                map.set(createMockAddress(BigInt(i)), i);
            }

            const start = performance.now();

            for (let i = 0; i < count; i++) {
                map.delete(createMockAddress(BigInt(i)));
            }

            const duration = performance.now() - start;

            expect(map.size).toBe(0);
            expect(duration).toBeLessThan(5000);
        });

        it('should iterate efficiently over large map', () => {
            const map = new AddressMap<number>();
            const count = 50000;

            for (let i = 0; i < count; i++) {
                map.set(createMockAddress(BigInt(i)), i);
            }

            const start = performance.now();

            let sum = 0;
            for (const [, value] of map) {
                sum += value;
            }

            const duration = performance.now() - start;

            expect(sum).toBe((count * (count - 1)) / 2);
            expect(duration).toBeLessThan(5000);
        });
    });
});
