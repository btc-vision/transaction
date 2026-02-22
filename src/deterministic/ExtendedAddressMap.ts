import { Address } from '../keypair/Address.js';
import { FastMap } from './FastMap.js';

/**
 * A map implementation using Address with both MLDSA and tweaked keys.
 * Uses the tweaked public key for lookup/indexing, but stores the full Address.
 */
export class ExtendedAddressMap<V> implements Disposable {
    // Store tweaked bigint -> index mapping for fast lookup
    private indexMap: FastMap<bigint, number>;

    // Store actual addresses and values
    private _keys: Address[] = [];
    private _values: V[] = [];

    constructor(iterable?: ReadonlyArray<readonly [Address, V]> | null) {
        this.indexMap = new FastMap();

        if (iterable) {
            for (const [key, value] of iterable) {
                this.set(key, value);
            }
        }
    }

    public get size(): number {
        return this._keys.length;
    }

    public set(key: Address, value: V): this {
        const keyBigInt = key.tweakedToBigInt();
        const existingIndex = this.indexMap.get(keyBigInt);

        if (existingIndex !== undefined) {
            // Update existing entry
            this._values[existingIndex] = value;
        } else {
            // Add new entry
            const newIndex = this._keys.length;
            this._keys.push(key);
            this._values.push(value);
            this.indexMap.set(keyBigInt, newIndex);
        }

        return this;
    }

    public get(key: Address): V | undefined {
        const keyBigInt = key.tweakedToBigInt();
        const index = this.indexMap.get(keyBigInt);
        if (index === undefined) {
            return undefined;
        }

        return this._values[index];
    }

    public has(key: Address): boolean {
        return this.indexMap.has(key.tweakedToBigInt());
    }

    public delete(key: Address): boolean {
        const keyBigInt = key.tweakedToBigInt();
        const index = this.indexMap.get(keyBigInt);

        if (index === undefined) {
            return false;
        }

        // Remove from arrays
        this._keys.splice(index, 1);
        this._values.splice(index, 1);

        // Rebuild index map (indices shifted after splice)
        this.indexMap.clear();
        for (let i = 0; i < this._keys.length; i++) {
            this.indexMap.set((this._keys[i] as Address).tweakedToBigInt(), i);
        }

        return true;
    }

    public clear(): void {
        this.indexMap.clear();
        this._keys = [];
        this._values = [];
    }

    public [Symbol.dispose](): void {
        this.clear();
    }

    public indexOf(address: Address): number {
        const index = this.indexMap.get(address.tweakedToBigInt());
        return index !== undefined ? index : -1;
    }

    *entries(): IterableIterator<[Address, V]> {
        for (let i = 0; i < this._keys.length; i++) {
            yield [this._keys[i] as Address, this._values[i] as V];
        }
    }

    *keys(): IterableIterator<Address> {
        for (const key of this._keys) {
            yield key;
        }
    }

    *values(): IterableIterator<V> {
        for (const value of this._values) {
            yield value;
        }
    }

    forEach(
        callback: (value: V, key: Address, map: ExtendedAddressMap<V>) => void,
        thisArg?: unknown,
    ): void {
        for (let i = 0; i < this._keys.length; i++) {
            callback.call(thisArg, this._values[i] as V, this._keys[i] as Address, this);
        }
    }

    *[Symbol.iterator](): IterableIterator<[Address, V]> {
        yield* this.entries();
    }
}
