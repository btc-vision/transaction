import { Network, Signer } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { QuantumBIP32Interface } from '@btc-vision/bip32';
import { ChainId } from '../../network/ChainId.js';
import { AddressRotationConfigBase } from '../../signer/IRotationSigner.js';

export type SupportedTransactionVersion = 1 | 2 | 3;

export interface ITweakedTransactionData {
    readonly mldsaSigner: QuantumBIP32Interface | null;
    readonly signer: Signer | ECPairInterface;
    readonly network: Network;
    readonly chainId?: ChainId;
    readonly nonWitnessUtxo?: Buffer;
    readonly noSignatures?: boolean;
    readonly unlockScript?: Buffer[];
    readonly txVersion?: SupportedTransactionVersion;

    /**
     * Address rotation configuration for per-UTXO signing.
     * When enabled, each UTXO can be signed by a different signer.
     */
    readonly addressRotation?: AddressRotationConfigBase;
}
