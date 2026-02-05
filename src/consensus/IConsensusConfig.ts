import { Consensus } from './Consensus.js';

export interface ConsensusConfig<T extends Consensus> {
    // The consensus type.
    readonly CONSENSUS: T;

    // The consensus name.
    readonly CONSENSUS_NAME: string;

    // The block height at which this consensus was enabled.
    readonly ENABLED_AT_BLOCK: bigint;
}
