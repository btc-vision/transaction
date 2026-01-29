export class DeterministicSet<T> implements Disposable {
    private elements: T[];

    constructor(private compareFn: (a: T, b: T) => number) {
        this.elements = [];
    }

    public get size(): number {
        return this.elements.length;
    }

    public static fromSet<T>(set: Set<T>, compareFn: (a: T, b: T) => number): DeterministicSet<T> {
        const deterministicSet = new DeterministicSet<T>(compareFn);
        for (const value of set) {
            deterministicSet.add(value);
        }
        return deterministicSet;
    }

    public add(value: T): void {
        const { found, index } = this.binarySearch(value);

        if (!found) {
            this.elements.splice(index, 0, value);
        }
    }

    public delete(value: T): boolean {
        const { found, index } = this.binarySearch(value);

        if (found) {
            this.elements.splice(index, 1);
            return true;
        }

        return false;
    }

    public has(value: T): boolean {
        return this.binarySearch(value).found;
    }

    public clear(): void {
        this.elements = [];
    }

    public [Symbol.dispose](): void {
        this.clear();
    }

    public forEach(callback: (value: T, set: DeterministicSet<T>) => void): void {
        for (const value of this.elements) {
            callback(value, this);
        }
    }

    *values(): IterableIterator<T> {
        yield* this.elements;
    }

    *[Symbol.iterator](): IterableIterator<T> {
        yield* this.elements;
    }

    private binarySearch(value: T): { found: boolean; index: number } {
        let left = 0,
            right = this.elements.length;

        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            const cmp = this.compareFn(this.elements[mid], value);

            if (cmp === 0) {
                return { found: true, index: mid };
            } else if (cmp < 0) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        return { found: false, index: left };
    }
}
