import { FastMap, PropertyExtendedKey } from './FastMap.js';

export class DeterministicMap<K extends PropertyExtendedKey, V> implements Disposable {
    private map: FastMap<K, V>;
    #keys: K[];

    constructor(private compareFn: (a: K, b: K) => number) {
        this.map = new FastMap<K, V>();
        this.#keys = [];
    }

    public get size(): number {
        return this.map.size;
    }

    public static fromMap<K extends PropertyExtendedKey, V>(
        map: FastMap<K, V>,
        compareFn: (a: K, b: K) => number,
    ): DeterministicMap<K, V> {
        const deterministicMap = new DeterministicMap<K, V>(compareFn);
        for (const [key, value] of map) {
            deterministicMap.set(key, value);
        }
        return deterministicMap;
    }

    public set(key: K, value: V): void {
        if (!this.map.has(key)) {
            // Binary search for insertion position
            let left = 0,
                right = this.#keys.length;

            while (left < right) {
                const mid = Math.floor((left + right) / 2);
                if (this.compareFn(this.#keys[mid], key) < 0) {
                    left = mid + 1;
                } else {
                    right = mid;
                }
            }
            this.#keys.splice(left, 0, key);
        }

        this.map.set(key, value);
    }

    public get(key: K): V | undefined {
        return this.map.get(key);
    }

    public *entries(): IterableIterator<[K, V]> {
        for (const key of this.#keys) {
            yield [key, this.map.get(key) as V];
        }
    }

    public *keys(): IterableIterator<K> {
        yield* this.#keys;
    }

    public *values(): IterableIterator<V> {
        for (const key of this.#keys) {
            const value = this.map.get(key);
            if (value === undefined && !this.map.has(key)) {
                throw new Error('Value not found');
            }

            yield value as V;
        }
    }

    public has(key: K): boolean {
        return this.map.has(key);
    }

    public delete(key: K): boolean {
        if (this.map.has(key)) {
            this.map.delete(key);

            // Binary search to find the key's index
            let left = 0,
                right = this.#keys.length - 1;

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const cmp = this.compareFn(this.#keys[mid], key);

                if (cmp === 0) {
                    // Found it, remove at this index
                    this.#keys.splice(mid, 1);
                    return true;
                } else if (cmp < 0) {
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }
        }
        return false;
    }

    public clear(): void {
        this.map.clear();
        this.#keys = [];
    }

    public [Symbol.dispose](): void {
        this.clear();
    }

    public forEach(callback: (value: V, key: K, map: DeterministicMap<K, V>) => void): void {
        for (const key of this.#keys) {
            const value = this.map.get(key) as V;
            callback(value, key, this);
        }
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        for (const key of this.#keys) {
            yield [key, this.map.get(key) as V];
        }
    }
}
