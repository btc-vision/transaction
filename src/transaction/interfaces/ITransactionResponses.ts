import type { RawChallenge } from '../../epoch/interfaces/IChallengeSolution.js';
import type { UTXO } from '../../utxo/interfaces/IUTXO.js';

export interface DeploymentResult {
    readonly transaction: [string, string];
    readonly contractAddress: string;
    readonly contractPubKey: string;
    readonly challenge: RawChallenge;
    readonly utxos: UTXO[];
    readonly inputUtxos: UTXO[];
}

export interface InteractionResponse {
    readonly fundingTransaction: string | null;
    readonly interactionTransaction: string;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
    readonly fundingUTXOs: UTXO[];
    readonly fundingInputUtxos: UTXO[];
    readonly challenge: RawChallenge;
    readonly interactionAddress: string | null;
    readonly compiledTargetScript: string | null;
}

export interface CancelledTransaction {
    readonly transaction: string;
    readonly nextUTXOs: UTXO[];
    readonly inputUtxos: UTXO[];
}
