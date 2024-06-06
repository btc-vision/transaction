import { ScriptPubKey } from '@btc-vision/bsi-bitcoin-rpc';

export interface UTXO {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly value: bigint;
    readonly scriptPubKey: ScriptPubKey;
}

export interface FetchUTXOParams {
    readonly address: string;
    readonly minAmount: bigint;
    readonly requestedAmount: bigint;
    readonly optimized?: boolean;
}

export interface RawUTXOResponse {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly value: string;
    readonly scriptPubKey: ScriptPubKey;
}
