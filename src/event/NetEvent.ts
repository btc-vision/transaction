export class NetEvent {
    public constructor(
        public readonly eventType: string,
        public readonly eventData: Uint8Array,
    ) {}
}
