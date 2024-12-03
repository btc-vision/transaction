import { i32 } from '../utils/types.js';
import { Address } from '../keypair/Address.js';
import { Map } from './Map.js';

export class AddressMap<V> extends Map<Address, V> {
    public set(key: Address, value: V): void {
        const index: i32 = this.indexOf(key);
        if (index == -1) {
            this._keys.push(key);
            this._values.push(value);
        } else {
            this._values[index] = value;
        }
    }

    public indexOf(address: Address): i32 {
        for (let i: i32 = 0; i < this._keys.length; i++) {
            const key = this._keys[i];

            if (address.equals(key)) {
                return i;
            }
        }

        return -1;
    }

    public has(key: Address): boolean {
        for (let i: i32 = 0; i < this._keys.length; i++) {
            if (key.equals(this._keys[i])) {
                return true;
            }
        }

        return false;
    }

    public get(key: Address): V | undefined {
        const index: i32 = this.indexOf(key);
        if (index == -1) {
            return;
        }
        return this._values[index];
    }

    public delete(key: Address): boolean {
        const index: i32 = this.indexOf(key);
        if (index == -1) {
            return false;
        }

        this._keys.splice(index, 1);
        this._values.splice(index, 1);

        return true;
    }

    *[Symbol.iterator](): IterableIterator<[Address, V]> {
        for (const key of this._keys) {
            yield [key, this.get(key) as V];
        }
    }
}
