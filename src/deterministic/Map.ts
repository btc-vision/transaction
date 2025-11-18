export class Map<K, V> {
    protected _keys: K[] = [];
    protected _values: V[] = [];

    public get size(): number {
        return this._keys.length;
    }

    public *keys(): IterableIterator<K> {
        yield* this._keys;
    }

    public *values(): IterableIterator<V> {
        yield* this._values;
    }

    public *entries(): IterableIterator<[K, V]> {
        for (let i: number = 0; i < this._keys.length; i++) {
            yield [this._keys[i], this._values[i]];
        }
    }

    public set(key: K, value: V): void {
        const index: number = this.indexOf(key);
        if (index == -1) {
            this._keys.push(key);
            this._values.push(value);
        } else {
            this._values[index] = value;
        }
    }

    public indexOf(key: K): number {
        for (let i: number = 0; i < this._keys.length; i++) {
            if (this._keys[i] == key) {
                return i;
            }
        }

        return -1;
    }

    public get(key: K): V | undefined {
        const index: number = this.indexOf(key);
        if (index == -1) {
            return undefined;
        }
        return this._values[index];
    }

    public has(key: K): boolean {
        return this.indexOf(key) != -1;
    }

    public delete(key: K): boolean {
        const index: number = this.indexOf(key);
        if (index == -1) {
            return false;
        }

        this._keys.splice(index, 1);
        this._values.splice(index, 1);
        return true;
    }

    public clear(): void {
        this._keys = [];
        this._values = [];
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        for (let i: number = 0; i < this._keys.length; i++) {
            yield [this._keys[i], this._values[i]];
        }
    }
}
