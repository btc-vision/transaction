import { ScriptPubKey } from '@btc-vision/bitcoin-rpc';
import { RotationSignerBase } from '../../signer/IRotationSigner.js';

export interface UTXO {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly value: bigint;
    readonly scriptPubKey: ScriptPubKey;

    redeemScript?: string | Uint8Array;
    witnessScript?: string | Uint8Array;
    nonWitnessUtxo?: string | Uint8Array;

    /**
     * Optional signer for this specific UTXO.
     * Used in address rotation mode where each UTXO may have its own signer.
     * If not provided, the signer will be resolved from the signerMap or the default signer.
     */
    signer?: RotationSignerBase;
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
