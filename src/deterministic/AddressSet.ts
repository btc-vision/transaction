import { Address } from '../keypair/Address.js';

export class AddressSet {
    private items: Set<bigint>;
    private keys: Address[];

    public constructor(keys: Address[] = []) {
        this.items = new Set();
        this.keys = [];

        for (const key of keys) {
            this.add(key);
        }
    }

    public get size(): number {
        return this.keys.length;
    }

    public add(address: Address): void {
        const addressBigInt = address.toBigInt();
        if (!this.items.has(addressBigInt)) {
            this.items.add(addressBigInt);
            this.keys.push(address);
        }
    }

    public has(address: Address): boolean {
        return this.items.has(address.toBigInt());
    }

    public remove(address: Address): void {
        const addressBigInt = address.toBigInt();
        if (this.items.delete(addressBigInt)) {
            this.keys = this.keys.filter((k) => k.toBigInt() !== addressBigInt);
        }
    }

    public clone(): AddressSet {
        return new AddressSet(this.keys);
    }

    public clear(): void {
        this.items.clear();
        this.keys = [];
    }

    public combine(set: AddressSet): AddressSet {
        const clone = this.clone();

        for (const key of set.keys) {
            clone.add(key);
        }

        return clone;
    }

    *[Symbol.iterator](): IterableIterator<Address> {
        yield* this.keys;
    }
}
