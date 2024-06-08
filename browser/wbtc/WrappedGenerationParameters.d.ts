/// <reference types="node" />
import { GenerationConstraints, WrappedGenerationParameters } from './Generate.js';
export declare class WrappedGeneration implements WrappedGenerationParameters {
    readonly constraints: GenerationConstraints;
    readonly entities: string[];
    readonly keys: string[];
    readonly signature: string;
    readonly vault: string;
    readonly pubKeys: Buffer[];
    constructor(params: WrappedGenerationParameters);
}
