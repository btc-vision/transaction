export class DeterministicMap<K, V> {
    private map: Map<K, V>;
    #keys: K[];

    constructor(private compareFn: (a: K, b: K) => number) {
        this.map = new Map<K, V>();
        this.#keys = [];
    }

    public get size(): number {
        return this.map.size;
    }

    public static fromMap<K, V>(
        map: Map<K, V>,
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
            this.#keys.push(key);
            this.#keys.sort(this.compareFn);
        }
        this.map.set(key, value);
    }

    public get(key: K): V | undefined {
        return this.map.get(key);
    }

    public keys(): IterableIterator<K> {
        return this.#keys.values();
    }

    public values(): IterableIterator<V> {
        const values: V[] = [];

        for (let i = 0; i < this.#keys.length; i++) {
            const key = this.#keys[i];
            const value = this.map.get(key);

            if (value) {
                values.push(value);
            } else {
                throw new Error('Value not found');
            }
        }

        return values.values();
    }

    public has(key: K): boolean {
        return this.map.has(key);
    }

    public delete(key: K): boolean {
        if (this.map.has(key)) {
            this.map.delete(key);
            this.#keys = this.#keys.filter((k) => k !== key);
            return true;
        }
        return false;
    }

    public clear(): void {
        this.map.clear();
        this.#keys = [];
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
