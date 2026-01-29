import { ConsensusConfig } from '../IConsensusConfig.js';
import { Consensus } from '../Consensus.js';

export const RoswellConsensus: ConsensusConfig<Consensus.Roswell> = {
    CONSENSUS: Consensus.Roswell,
    CONSENSUS_NAME: 'Roswell',

    // The block height at which this consensus was enabled.
    ENABLED_AT_BLOCK: 0n,
};
