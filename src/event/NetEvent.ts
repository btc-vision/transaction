export class NetEvent {
    public constructor(
        public readonly type: string,
        public readonly data: Uint8Array,
    ) {}
}
