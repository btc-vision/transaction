import { Network, Signer } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import { QuantumBIP32Interface } from '@btc-vision/bip32';
import { ChainId } from '../../network/ChainId.js';
import { AddressRotationConfigBase } from '../../signer/IRotationSigner.js';

export type SupportedTransactionVersion = 1 | 2 | 3;

export interface ITweakedTransactionData {
    readonly mldsaSigner: QuantumBIP32Interface | null;
    readonly signer: Signer | UniversalSigner;
    readonly network: Network;
    readonly chainId?: ChainId;
    readonly nonWitnessUtxo?: Uint8Array;
    readonly noSignatures?: boolean;
    readonly unlockScript?: Uint8Array[];
    readonly txVersion?: SupportedTransactionVersion;

    /**
     * Address rotation configuration for per-UTXO signing.
     * When enabled, each UTXO can be signed by a different signer.
     */
    readonly addressRotation?: AddressRotationConfigBase;
}
