import { VaultUTXOs } from '../transaction/processor/PsbtTransaction.js';
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
export interface UnwrappedGenerationParameters {
    readonly vaultUTXOs: VaultUTXOs[];
    readonly balance: string;
}
