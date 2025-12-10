import { ScriptPubKey } from '@btc-vision/bitcoin-rpc';
import { RotationSigner } from '../../signer/AddressRotation.js';

export interface UTXO {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly value: bigint;
    readonly scriptPubKey: ScriptPubKey;

    redeemScript?: string | Buffer;
    witnessScript?: string | Buffer;
    nonWitnessUtxo?: string | Buffer;

    /**
     * Optional signer for this specific UTXO.
     * Used in address rotation mode where each UTXO may have its own signer.
     * If not provided, the signer will be resolved from the signerMap or the default signer.
     */
    signer?: RotationSigner;
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
