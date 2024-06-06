import { FetchUTXOParams, UTXO } from './interfaces/IUTXO.js';
export declare class UTXOManager {
    private readonly opnetAPIUrl;
    private readonly utxoPath;
    constructor(opnetAPIUrl: string);
    fetchUTXO(settings: FetchUTXOParams): Promise<UTXO[]>;
}
