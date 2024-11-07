import { GenerationConstraints, WrappedGenerationParameters } from './Generate.js';

export class WrappedGeneration implements WrappedGenerationParameters {
    /** Generation constraints */
    public readonly constraints: GenerationConstraints;

    /** Public trusted entities */
    public readonly entities: string[];

    /** Public trusted keys */
    public readonly keys: string[];

    /** OPNet Signature that verify the trusted keys and entities */
    public readonly signature: string;

    /** Vault address (p2ms) */
    public readonly vault: string;

    /**
     * Public keys of the trusted entities
     */
    public readonly pubKeys: Buffer[];

    constructor(params: WrappedGenerationParameters) {
        this.constraints = params.constraints;
        this.entities = params.entities;
        this.keys = params.keys;
        this.signature = params.signature;
        this.vault = params.vault;

        this.pubKeys = this.keys.map((key: string) => Buffer.from(key, 'base64'));
    }
}
