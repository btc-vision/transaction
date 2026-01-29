export type PropertyExtendedKey = PropertyKey | bigint;

/**
 * Like Record, but supports bigint keys (which JS auto-converts to strings).
 * Reflects actual JavaScript behavior where obj[123n] becomes obj["123"].
 */
export type FastRecord<V> = {
    [key: string]: V;
};

export type IndexKey = string | number;

export class FastMap<K extends PropertyExtendedKey, V> implements Disposable {
    protected _keys: K[] = [];
    protected _values: FastRecord<V> = {};

    constructor(iterable?: ReadonlyArray<readonly [K, V]> | null | FastMap<K, V>) {
        if (iterable instanceof FastMap) {
            this.setAll(iterable);
        } else {
            if (iterable) {
                for (const [key, value] of iterable) {
                    this.set(key, value);
                }
            }
        }
    }

    public get size(): number {
        return this._keys.length;
    }

    public setAll(map: FastMap<K, V>): void {
        this._keys = [...map._keys];
        this._values = { ...map._values };
    }

    public addAll(map: FastMap<K, V>): void {
        for (const [key, value] of map.entries()) {
            this.set(key, value);
        }
    }

    public *keys(): IterableIterator<K> {
        yield* this._keys;
    }

    public *values(): IterableIterator<V> {
        for (const key of this._keys) {
            yield this._values[key as IndexKey] as V;
        }
    }

    public *entries(): IterableIterator<[K, V]> {
        for (const key of this._keys) {
            yield [key, this._values[key as IndexKey] as V];
        }
    }

    public set(key: K, value: V): this {
        if (!this.has(key)) {
            this._keys.push(key);
        }

        this._values[key as IndexKey] = value;

        return this;
    }

    public indexOf(key: K): number {
        if (!this.has(key)) {
            return -1;
        }

        for (let i = 0; i < this._keys.length; i++) {
            if (this._keys[i] === key) {
                return i;
            }
        }

        throw new Error('Key not found, this should not happen.');
    }

    public get(key: K): V | undefined {
        return this._values[key as IndexKey];
    }

    public has(key: K): boolean {
        return Object.prototype.hasOwnProperty.call(this._values, key as IndexKey);
    }

    public delete(key: K): boolean {
        if (!this.has(key)) {
            return false;
        }

        const index = this.indexOf(key);
        this._keys.splice(index, 1);

        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this._values[key as IndexKey];
        return true;
    }

    public clear(): void {
        this._keys = [];
        this._values = {};
    }

    public [Symbol.dispose](): void {
        this.clear();
    }

    public forEach(
        callback: (value: V, key: K, map: FastMap<K, V>) => void,
        thisArg?: unknown,
    ): void {
        for (const key of this._keys) {
            callback.call(thisArg, this._values[key as IndexKey] as V, key, this);
        }
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        for (const key of this._keys) {
            yield [key, this._values[key as IndexKey] as V];
        }
    }
}
