export interface GenerationConstraints {
    readonly timestamp: number;
    readonly version: string;
    readonly minimum: number;
    readonly transactionMinimum: number;
}
export interface WrappedGenerationParameters {
    readonly keys: string[];
    readonly vault: string;
    readonly entities: string[];
    readonly signature: string;
    readonly constraints: GenerationConstraints;
}
