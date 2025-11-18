export class DeterministicMap<K, V> {
    private map: Map<K, V>;
    private readonly compareFn: (a: K, b: K) => number;

    #keyOrder: K[];

    constructor(compareFn: (a: K, b: K) => number) {
        this.map = new Map<K, V>();
        this.#keyOrder = [];
        this.compareFn = compareFn;
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
            this.#keyOrder.push(key);
            this.#keyOrder.sort(this.compareFn);
        }
        this.map.set(key, value);
    }

    public get(key: K): V | undefined {
        return this.map.get(key);
    }

    public keys(): IterableIterator<K> {
        return this.#keyOrder.values();
    }

    public values(): IterableIterator<V> {
        const values: V[] = [];

        for (let i = 0; i < this.#keyOrder.length; i++) {
            const key = this.#keyOrder[i];
            const value = this.map.get(key);

            if (value !== undefined) {
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
            this.#keyOrder = this.#keyOrder.filter((k) => k !== key);
            return true;
        }
        return false;
    }

    public clear(): void {
        this.map.clear();
        this.#keyOrder = [];
    }

    public forEach(callback: (value: V, key: K, map: DeterministicMap<K, V>) => void): void {
        for (const key of this.#keyOrder) {
            const value = this.map.get(key) as V;
            callback(value, key, this);
        }
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        for (const key of this.#keyOrder) {
            yield [key, this.map.get(key) as V];
        }
    }
}
