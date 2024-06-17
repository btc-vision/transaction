import { Consensus } from './Consensus.js';
export interface ConsensusConfig<T extends Consensus> {
    readonly CONSENSUS: T;
    readonly CONSENSUS_NAME: string;
    readonly ENABLED_AT_BLOCK: bigint;
    readonly VAULT_MINIMUM_AMOUNT: bigint;
    readonly VAULT_NETWORK_CONSOLIDATION_ACCEPTANCE: bigint;
    readonly UNWRAP_CONSOLIDATION_PREPAID_FEES: bigint;
    readonly UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT: bigint;
}
export declare const OPNetConsensusConfig: {
    [key in Consensus]: ConsensusConfig<key>;
};
export declare const currentConsensus = Consensus.Roswell;
export declare const currentConsensusConfig: ConsensusConfig<Consensus>;
