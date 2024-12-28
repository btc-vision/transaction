import { ScriptPubKey } from '@btc-vision/bsi-bitcoin-rpc';

export interface UTXO {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly value: bigint;
    readonly scriptPubKey: ScriptPubKey;

    redeemScript?: string | Buffer;
    witnessScript?: string | Buffer;
    nonWitnessUtxo?: string | Buffer;
}

export interface FetchUTXOParams {
    readonly address: string;
    readonly minAmount: bigint;
    readonly requestedAmount: bigint;
    optimized?: boolean;
    usePendingUTXO?: boolean;
}

export interface FetchUTXOParamsMultiAddress {
    readonly addresses: string[];
    readonly minAmount: bigint;
    readonly requestedAmount: bigint;
    readonly optimized?: boolean;
    readonly usePendingUTXO?: boolean;
}

export interface RawUTXOResponse {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly value: string;
    readonly scriptPubKey: ScriptPubKey;
    readonly raw: string;
}
