import { FetchUTXOParams, FetchUTXOParamsMultiAddress, UTXO } from './interfaces/IUTXO.js';
import { WrappedGeneration } from '../wbtc/WrappedGenerationParameters.js';
import { BroadcastResponse } from './interfaces/BroadcastResponse.js';
export declare class OPNetLimitedProvider {
    private readonly opnetAPIUrl;
    private readonly utxoPath;
    private readonly rpc;
    constructor(opnetAPIUrl: string);
    fetchUTXO(settings: FetchUTXOParams): Promise<UTXO[]>;
    fetchUTXOMultiAddr(settings: FetchUTXOParamsMultiAddress): Promise<UTXO[]>;
    broadcastTransaction(transaction: string, psbt: boolean): Promise<BroadcastResponse | undefined>;
    rpcMethod(method: string, paramsMethod: unknown[]): Promise<unknown>;
    fetchWrapParameters(amount: bigint): Promise<WrappedGeneration | undefined>;
}
