import { i32 } from '../utils/types.js';

export class Map<K, V> {
    protected _keys: K[] = [];
    protected _values: V[] = [];

    public get size(): i32 {
        return this._keys.length;
    }

    public keys(): K[] {
        return this._keys;
    }

    public values(): V[] {
        return this._values;
    }

    public entries(): [K, V][] {
        const result: [K, V][] = [];
        for (let i: i32 = 0; i < this._keys.length; i++) {
            result.push([this._keys[i], this._values[i]]);
        }
        return result;
    }

    public set(key: K, value: V): void {
        const index: i32 = this.indexOf(key);
        if (index == -1) {
            this._keys.push(key);
            this._values.push(value);
        } else {
            this._values[index] = value;
        }
    }

    public indexOf(key: K): i32 {
        for (let i: i32 = 0; i < this._keys.length; i++) {
            if (this._keys[i] == key) {
                return i;
            }
        }

        return -1;
    }

    public get(key: K): V | undefined {
        const index: i32 = this.indexOf(key);
        if (index == -1) {
            return undefined;
        }
        return this._values[index];
    }

    public has(key: K): boolean {
        return this.indexOf(key) != -1;
    }

    public delete(key: K): boolean {
        const index: i32 = this.indexOf(key);
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
}
