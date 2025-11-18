export class Map<K, V> {
    protected _keys: K[] = [];
    protected _values: Record<string, V> = {};

    public get size(): number {
        return this._keys.length;
    }

    public *keys(): IterableIterator<K> {
        yield* this._keys;
    }

    public *values(): IterableIterator<V> {
        for (const key of this._keys) {
            yield this._values[this.keyToString(key)];
        }
    }

    public *entries(): IterableIterator<[K, V]> {
        for (const key of this._keys) {
            yield [key, this._values[this.keyToString(key)]];
        }
    }

    public set(key: K, value: V): void {
        const keyStr = this.keyToString(key);
        if (!this.has(key)) {
            this._keys.push(key);
        }

        this._values[keyStr] = value;
    }

    public indexOf(key: K): number {
        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i] === key) {
                return i;
            }
        }
        return -1;
    }

    public get(key: K): V | undefined {
        return this._values[this.keyToString(key)];
    }

    public has(key: K): boolean {
        return Object.prototype.hasOwnProperty.call(this._values, this.keyToString(key));
    }

    public delete(key: K): boolean {
        const index = this.indexOf(key);
        if (index === -1) {
            return false;
        }

        const keyStr = this.keyToString(key);
        this._keys.splice(index, 1);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this._values[keyStr];
        return true;
    }

    public clear(): void {
        this._keys = [];
        this._values = {};
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        for (const key of this._keys) {
            yield [key, this._values[this.keyToString(key)]];
        }
    }

    private keyToString(key: K): string {
        if (typeof key === 'string') {
            return key;
        }
        if (typeof key === 'number' || typeof key === 'boolean') {
            return String(key);
        }
        if (typeof key === 'object' && key !== null) {
            return JSON.stringify(key);
        }
        return String(key);
    }
}
