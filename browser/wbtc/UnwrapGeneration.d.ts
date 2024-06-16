import { UnwrappedGenerationParameters } from './Generate.js';
import { VaultUTXOs } from '../transaction/processor/PsbtTransaction.js';
export declare class UnwrapGeneration implements Omit<UnwrappedGenerationParameters, 'balance'> {
    readonly vaultUTXOs: VaultUTXOs[];
    readonly balance: bigint;
    constructor(params: UnwrappedGenerationParameters);
}
