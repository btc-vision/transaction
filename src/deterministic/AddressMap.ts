import { Address } from '../keypair/Address.js';

export class AddressMap<V> {
    private items: Map<bigint, V>;
    private keyOrder: Address[];

    constructor(iterable?: ReadonlyArray<readonly [Address, V]> | null) {
        this.items = new Map();
        this.keyOrder = [];

        if (iterable) {
            for (const [key, value] of iterable) {
                this.set(key, value);
            }
        }
    }

    get size(): number {
        return this.keyOrder.length;
    }

    public set(key: Address, value: V): void {
        const keyBigInt = key.toBigInt();
        if (!this.items.has(keyBigInt)) {
            this.keyOrder.push(key);
        }
        this.items.set(keyBigInt, value);
    }

    public get(key: Address): V | undefined {
        return this.items.get(key.toBigInt());
    }

    public has(key: Address): boolean {
        return this.items.has(key.toBigInt());
    }

    public delete(key: Address): boolean {
        const keyBigInt = key.toBigInt();
        if (this.items.delete(keyBigInt)) {
            this.keyOrder = this.keyOrder.filter((k) => k.toBigInt() !== keyBigInt);
            return true;
        }
        return false;
    }

    public clear(): void {
        this.items.clear();
        this.keyOrder = [];
    }

    public indexOf(address: Address): number {
        const addressBigInt = address.toBigInt();
        for (let i: number = 0; i < this.keyOrder.length; i++) {
            if (this.keyOrder[i].toBigInt() === addressBigInt) {
                return i;
            }
        }
        return -1;
    }

    *entries(): IterableIterator<[Address, V]> {
        for (const key of this.keyOrder) {
            yield [key, this.items.get(key.toBigInt()) as V];
        }
    }

    *keys(): IterableIterator<Address> {
        yield* this.keyOrder;
    }

    *values(): IterableIterator<V> {
        for (const key of this.keyOrder) {
            yield this.items.get(key.toBigInt()) as V;
        }
    }

    forEach(
        callback: (value: V, key: Address, map: AddressMap<V>) => void,
        thisArg?: unknown,
    ): void {
        for (const key of this.keyOrder) {
            callback.call(thisArg, this.items.get(key.toBigInt()) as V, key, this);
        }
    }

    [Symbol.iterator](): IterableIterator<[Address, V]> {
        return this.entries();
    }
}
