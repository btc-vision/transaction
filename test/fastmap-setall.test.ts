import { describe, expect, it } from 'vitest';
import { FastBigIntMap } from './old/FastBigIntMap.js';
import { FastMap } from '../src/index.js';

describe('setAll bug', () => {
    describe('FastBigIntMap (original - correct behavior)', () => {
        it('should replace all entries, not merge', () => {
            const map1 = new FastBigIntMap([
                [1n, 100n],
                [2n, 200n],
            ]);

            const map2 = new FastBigIntMap([
                [3n, 300n],
                [4n, 400n],
            ]);

            // setAll should REPLACE, not merge
            map2.setAll(map1);

            // Should have entries from map1 only
            expect(map2.size).toBe(2);
            expect(map2.get(1n)).toBe(100n);
            expect(map2.get(2n)).toBe(200n);

            // Old entries should be GONE
            expect(map2.has(3n)).toBe(false);
            expect(map2.has(4n)).toBe(false);
            expect(map2.get(3n)).toBeUndefined();
            expect(map2.get(4n)).toBeUndefined();
        });
    });

    describe('FastMap (replacement - should match original behavior)', () => {
        it('should replace all entries, not merge', () => {
            const map1 = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);

            const map2 = new FastMap<bigint, bigint>([
                [3n, 300n],
                [4n, 400n],
            ]);

            // setAll should REPLACE, not merge
            map2.setAll(map1);

            // Should have entries from map1 only
            expect(map2.size).toBe(2);
            expect(map2.get(1n)).toBe(100n);
            expect(map2.get(2n)).toBe(200n);

            // Old entries should be GONE
            expect(map2.has(3n)).toBe(false);
            expect(map2.has(4n)).toBe(false);
            expect(map2.get(3n)).toBeUndefined();
            expect(map2.get(4n)).toBeUndefined();
        });

        it('should not leak old keys in iteration', () => {
            const map1 = new FastMap<bigint, bigint>([[1n, 100n]]);

            const map2 = new FastMap<bigint, bigint>([
                [2n, 200n],
                [3n, 300n],
            ]);

            map2.setAll(map1);

            const keys = [...map2.keys()];
            const values = [...map2.values()];
            const entries = [...map2.entries()];

            expect(keys).toEqual([1n]);
            expect(values).toEqual([100n]);
            expect(entries).toEqual([[1n, 100n]]);
        });

        it('should handle overlapping keys correctly', () => {
            const map1 = new FastMap<bigint, bigint>([
                [1n, 100n],
                [2n, 200n],
            ]);

            const map2 = new FastMap<bigint, bigint>([
                [2n, 999n], // overlapping key
                [3n, 300n],
            ]);

            map2.setAll(map1);

            // Should have map1's values, including overwriting the overlapping key
            expect(map2.size).toBe(2);
            expect(map2.get(1n)).toBe(100n);
            expect(map2.get(2n)).toBe(200n); // map1's value, not 999n

            // 3n should be gone
            expect(map2.has(3n)).toBe(false);
        });
    });

    describe('behavior parity', () => {
        it('FastMap.setAll should behave identically to FastBigIntMap.setAll', () => {
            // Setup identical scenarios
            const oldMap1 = new FastBigIntMap([
                [1n, 10n],
                [2n, 20n],
            ]);
            const oldMap2 = new FastBigIntMap([
                [3n, 30n],
                [4n, 40n],
                [5n, 50n],
            ]);

            const newMap1 = new FastMap<bigint, bigint>([
                [1n, 10n],
                [2n, 20n],
            ]);
            const newMap2 = new FastMap<bigint, bigint>([
                [3n, 30n],
                [4n, 40n],
                [5n, 50n],
            ]);

            // Perform setAll on both
            oldMap2.setAll(oldMap1);
            newMap2.setAll(newMap1);

            // Compare sizes
            expect(newMap2.size).toBe(oldMap2.size);

            // Compare keys
            expect([...newMap2.keys()]).toEqual([...oldMap2.keys()]);

            // Compare values
            expect([...newMap2.values()]).toEqual([...oldMap2.values()]);

            // Compare entries
            expect([...newMap2.entries()]).toEqual([...oldMap2.entries()]);
        });
    });
});
