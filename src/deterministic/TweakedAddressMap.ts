import { Address } from '../keypair/Address.js';
import { FastMap } from './FastMap.js';

export class TweakedAddressMap<V> {
    private items: FastMap<bigint, V>;

    constructor(iterable?: ReadonlyArray<readonly [Address, V]> | null) {
        this.items = new FastMap();

        if (iterable) {
            for (const [key, value] of iterable) {
                this.set(key, value);
            }
        }
    }

    public get size(): number {
        return this.items.size;
    }

    public set(key: Address, value: V): this {
        const keyBigInt = key.tweakedToBigInt();
        this.items.set(keyBigInt, value);

        return this;
    }

    public get(key: Address): V | undefined {
        return this.items.get(key.tweakedToBigInt());
    }

    public has(key: Address): boolean {
        return this.items.has(key.tweakedToBigInt());
    }

    public delete(key: Address): boolean {
        const keyBigInt = key.tweakedToBigInt();
        return this.items.delete(keyBigInt);
    }

    public clear(): void {
        this.items.clear();
    }

    public indexOf(address: Address): number {
        return this.items.indexOf(address.tweakedToBigInt());
    }

    /**
     * WARNING, THIS RETURN NEW COPY OF THE KEYS
     */
    *entries(): IterableIterator<[Address, V]> {
        for (const [keyBigInt, value] of this.items.entries()) {
            yield [Address.fromBigInt(keyBigInt), value];
        }
    }

    *keys(): IterableIterator<Address> {
        for (const keyBigInt of this.items.keys()) {
            yield Address.fromBigInt(keyBigInt);
        }
    }

    *values(): IterableIterator<V> {
        for (const value of this.items.values()) {
            yield value;
        }
    }

    forEach(
        callback: (value: V, key: Address, map: TweakedAddressMap<V>) => void,
        thisArg?: unknown,
    ): void {
        for (const [keyBigInt, value] of this.items.entries()) {
            const key = Address.fromBigInt(0n, keyBigInt);
            callback.call(thisArg, value, key, this);
        }
    }

    *[Symbol.iterator](): IterableIterator<[Address, V]> {
        yield* this.entries();
    }
}
