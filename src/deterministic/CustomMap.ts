export class CustomMap<K, V> implements Disposable {
    private static readonly INITIAL_CAPACITY = 16;
    private static readonly LOAD_FACTOR = 0.75;

    #keys: (K | undefined)[];
    #values: (V | undefined)[];

    private deleted: boolean[];
    private capacity: number;

    constructor() {
        this.capacity = CustomMap.INITIAL_CAPACITY;
        this.#keys = new Array<K>(this.capacity);
        this.#values = new Array<V>(this.capacity);
        this.deleted = new Array<boolean>(this.capacity).fill(false);
    }

    private _size: number = 0;

    public get size(): number {
        return this._size;
    }

    public set(key: K, value: V): boolean {
        let exist: boolean = true;

        const index = this.findInsertIndex(key);
        if (this.#keys[index] === undefined || this.deleted[index]) {
            this._size++;
            exist = false;
        }

        this.#keys[index] = key;
        this.#values[index] = value;
        this.deleted[index] = false;

        if (this._size > this.capacity * CustomMap.LOAD_FACTOR) {
            this.resize();
        }

        return exist;
    }

    public get(key: K): V | undefined {
        const index = this.findIndex(key);
        return index === -1 ? undefined : this.#values[index];
    }

    public has(key: K): boolean {
        return this.findIndex(key) !== -1;
    }

    public indexOf(key: K): number {
        return this.findIndex(key);
    }

    public delete(key: K): boolean {
        const index = this.findIndex(key);

        if (index === -1) {
            return false;
        }

        this.#keys[index] = undefined;
        this.#values[index] = undefined;
        this.deleted[index] = true;
        this._size--;

        return true;
    }

    public clear(): void {
        this.#keys = new Array<K>(this.capacity);
        this.#values = new Array<V>(this.capacity);
        this.deleted = new Array<boolean>(this.capacity).fill(false);
        this._size = 0;
    }

    public [Symbol.dispose](): void {
        this.clear();
    }

    public *entries(): MapIterator<[K, V]> {
        for (let i = 0; i < this.capacity; i++) {
            if (this.#keys[i] !== undefined && !this.deleted[i]) {
                yield [this.#keys[i] as K, this.#values[i] as V];
            }
        }
    }

    public *keys(): MapIterator<K> {
        for (let i = 0; i < this.capacity; i++) {
            if (this.#keys[i] !== undefined && !this.deleted[i]) {
                yield this.#keys[i] as K;
            }
        }
    }

    public *values(): MapIterator<V> {
        for (let i = 0; i < this.capacity; i++) {
            if (this.#keys[i] !== undefined && !this.deleted[i]) {
                yield this.#values[i] as V;
            }
        }
    }

    *[Symbol.iterator](): MapIterator<[K, V]> {
        yield* this.entries();
    }

    private hashBigInt(key: bigint): number {
        // For small bigints that fit in 32 bits, use direct conversion
        if (key >= -2147483648n && key <= 2147483647n) {
            return Number(key) | 0;
        }

        // For larger bigints, use bit manipulation
        // Mix high and low 32-bit parts
        let hash = 2166136261; // FNV-1a initial value

        // Process the bigint in 32-bit chunks
        let n = key < 0n ? -key : key;

        while (n > 0n) {
            // Extract 32-bit chunk
            const chunk = Number(n & 0xffffffffn);
            hash ^= chunk;
            hash = Math.imul(hash, 16777619);
            n = n >> 32n;
        }

        // Mix in the sign
        if (key < 0n) {
            hash ^= 0x80000000;
            hash = Math.imul(hash, 16777619);
        }

        return Math.abs(hash);
    }

    private hash(key: K): number {
        let hash = 0;

        switch (typeof key) {
            case 'number':
                // Handle NaN and infinity specially
                if (key !== key) return 0x7ff8000000000000; // NaN
                if (!isFinite(key)) return key > 0 ? 0x7ff0000000000000 : 0xfff0000000000000;
                // Use the number itself as hash
                hash = key | 0; // Convert to 32-bit integer
                break;

            case 'string':
                // FNV-1a hash for strings
                hash = 2166136261;
                for (let i = 0; i < (key as string).length; i++) {
                    hash ^= (key as string).charCodeAt(i);
                    hash = Math.imul(hash, 16777619);
                }
                break;

            case 'boolean':
                hash = key ? 1231 : 1237;
                break;

            case 'symbol': {
                // Symbols need special handling - use description
                const desc = (key as symbol).description || '';
                hash = this.hash(desc as K); // Recursive call with string
                break;
            }

            case 'bigint':
                // Convert bigint to string for hashing
                hash = this.hashBigInt(key);
                break;

            case 'undefined':
                hash = 0;
                break;

            case 'object':
                if (key === null) {
                    hash = 0;
                } else if (key instanceof Date) {
                    hash = key.getTime() | 0;
                } else if (ArrayBuffer.isView(key) || key instanceof ArrayBuffer) {
                    // Handle Buffer, TypedArrays, ArrayBuffer
                    hash = this.hashBuffer(key);
                } else if (Array.isArray(key)) {
                    // Hash arrays by combining element hashes
                    hash = 1;
                    for (const item of key) {
                        hash = Math.imul(hash, 31) + this.hash(item as K);
                    }
                } else {
                    throw new Error('Raw object not supported.');
                    // For objects, we need reference equality
                    // So we'll use linear probing with === comparison
                    // Start with a random-ish position
                    //hash = 0x42424242;
                }
                break;

            case 'function':
                // Hash function by its string representation
                hash = this.hash(key.toString() as K);
                break;
        }

        // Ensure positive index
        return Math.abs(hash) % this.capacity;
    }

    private hashBuffer(buffer: ArrayBuffer | object): number {
        let bytes: Uint8Array;

        if (buffer instanceof ArrayBuffer) {
            bytes = new Uint8Array(buffer);
        } else if (ArrayBuffer.isView(buffer)) {
            bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        } else {
            return 0;
        }

        // FNV-1a hash for bytes
        let hash = 2166136261;
        for (let i = 0; i < Math.min(bytes.length, 100); i++) {
            // Cap at 100 bytes for performance
            hash ^= bytes[i] as number;
            hash = Math.imul(hash, 16777619);
        }
        return hash;
    }

    private equals(a: K, b: K): boolean {
        // Handle special cases
        if (a === b) return true;

        // NaN === NaN should be true for map #keys
        if (typeof a === 'number' && typeof b === 'number' && a !== a && b !== b) {
            return true;
        }

        // For buffers, do deep comparison
        if (
            (ArrayBuffer.isView(a) || a instanceof ArrayBuffer) &&
            (ArrayBuffer.isView(b) || b instanceof ArrayBuffer)
        ) {
            return this.buffersEqual(a, b);
        }

        return false;
    }

    private buffersEqual(a: ArrayBuffer | object, b: ArrayBuffer | object): boolean {
        const bytesA = this.getBytes(a);
        const bytesB = this.getBytes(b);

        if (bytesA.length !== bytesB.length) return false;

        for (let i = 0; i < bytesA.length; i++) {
            if (bytesA[i] !== bytesB[i]) return false;
        }

        return true;
    }

    private getBytes(buffer: ArrayBuffer | object): Uint8Array {
        if (buffer instanceof ArrayBuffer) {
            return new Uint8Array(buffer);
        } else if (ArrayBuffer.isView(buffer)) {
            return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        }
        return new Uint8Array(0);
    }

    private findIndex(key: K): number {
        let index = this.hash(key);

        while (this.#keys[index] !== undefined || this.deleted[index]) {
            if (this.#keys[index] !== undefined && this.equals(this.#keys[index] as K, key)) {
                return index;
            }
            index = (index + 1) % this.capacity;
        }

        return -1;
    }

    private findInsertIndex(key: K): number {
        let index = this.hash(key);

        while (this.#keys[index] !== undefined && !this.deleted[index]) {
            if (this.equals(this.#keys[index] as K, key)) {
                return index; // Key already exists
            }
            index = (index + 1) % this.capacity;
        }

        return index;
    }

    private resize(): void {
        const oldKeys = this.#keys;
        const oldValues = this.#values;

        this.capacity *= 2;
        this.#keys = new Array<K>(this.capacity);
        this.#values = new Array<V>(this.capacity);
        this.deleted = new Array<boolean>(this.capacity).fill(false);
        this._size = 0;

        for (let i = 0; i < oldKeys.length; i++) {
            if (oldKeys[i] !== undefined && !this.deleted[i]) {
                this.set(oldKeys[i] as K, oldValues[i] as V);
            }
        }
    }
}
