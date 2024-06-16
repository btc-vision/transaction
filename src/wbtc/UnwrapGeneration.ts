import { UnwrappedGenerationParameters } from './Generate.js';
import { VaultUTXOs } from '../transaction/processor/PsbtTransaction.js';

export class UnwrapGeneration implements Omit<UnwrappedGenerationParameters, 'balance'> {
    public readonly vaultUTXOs: VaultUTXOs[];

    public readonly balance: bigint;

    constructor(params: UnwrappedGenerationParameters) {
        this.vaultUTXOs = params.vaultUTXOs;
        this.balance = BigInt(params.balance);
    }
}
