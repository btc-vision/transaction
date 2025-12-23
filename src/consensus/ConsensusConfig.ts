import { Consensus } from './Consensus.js';
import { ConsensusConfig } from './IConsensusConfig.js';
import { RoswellConsensus } from './metadata/RoswellConsensus.js';

export const OPNetConsensusConfig: { [key in Consensus]?: ConsensusConfig<key> } = {
    [Consensus.Roswell]: RoswellConsensus,
};

export const currentConsensus = Consensus.Roswell;
export const currentConsensusConfig = OPNetConsensusConfig[
    currentConsensus
] as ConsensusConfig<Consensus.Roswell>;
