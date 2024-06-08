import { FetchUTXOParams, UTXO } from './interfaces/IUTXO.js';
import { WrappedGeneration } from '../wbtc/WrappedGenerationParameters.js';
export declare class OPNetLimitedProvider {
    private readonly opnetAPIUrl;
    private readonly utxoPath;
    private readonly rpc;
    constructor(opnetAPIUrl: string);
    fetchUTXO(settings: FetchUTXOParams): Promise<UTXO[]>;
    fetchWrapParameters(amount: bigint): Promise<WrappedGeneration | undefined>;
}
