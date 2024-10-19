export class DeterministicSet<T> {
    private elements: T[];

    constructor(private compareFn: (a: T, b: T) => number) {
        this.elements = [];
    }

    public add(value: T): void {
        if (!this.elements.includes(value)) {
            this.elements.push(value);
            this.elements.sort(this.compareFn);
        }
    }

    public delete(value: T): boolean {
        const index = this.elements.indexOf(value);
        if (index === -1) {
            return false;
        }

        this.elements.splice(index, 1);
        return true;
    }

    public has(value: T): boolean {
        return this.elements.includes(value);
    }

    public clear(): void {
        this.elements = [];
    }

    public forEach(callback: (value: T, set: DeterministicSet<T>) => void): void {
        for (const value of this.elements) {
            callback(value, this);
        }
    }

    public static fromSet<T>(set: Set<T>, compareFn: (a: T, b: T) => number): DeterministicSet<T> {
        const deterministicSet = new DeterministicSet<T>(compareFn);
        for (const value of set) {
            deterministicSet.add(value);
        }
        return deterministicSet;
    }

    public get size(): number {
        return this.elements.length;
    }

    *[Symbol.iterator](): IterableIterator<T> {
        for (const value of this.elements) {
            yield value;
        }
    }
}
