import { i32 } from '../utils/types.js';
import { Address } from '../keypair/Address.js';

export class AddressSet {
    private keys: Address[];

    public constructor(keys: Address[] = []) {
        this.keys = keys;
    }

    public add(address: Address): void {
        if (!this.has(address)) {
            this.keys.push(address);
        }
    }

    public has(address: Address): boolean {
        for (let i = 0; i < this.keys.length; i++) {
            if (this.keys[i].equals(address)) {
                return true;
            }
        }

        return false;
    }

    public remove(address: Address): void {
        const index = this.keys.findIndex((key) => key.equals(address));

        if (index !== -1) {
            this.keys.splice(index, 1);
        }
    }

    public size(): i32 {
        return this.keys.length;
    }

    public clone(): AddressSet {
        const clone = new AddressSet();

        for (let i = 0; i < this.keys.length; i++) {
            clone.add(this.keys[i]);
        }

        return clone;
    }

    public clear(): void {
        this.keys = [];
    }

    public combine(set: AddressSet): AddressSet {
        const clone = this.clone();

        for (let i = 0; i < set.keys.length; i++) {
            clone.add(set.keys[i]);
        }

        return clone;
    }
}
