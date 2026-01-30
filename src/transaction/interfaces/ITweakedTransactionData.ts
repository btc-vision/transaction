import type { Network, Signer } from '@btc-vision/bitcoin';
import type { SigningPoolLike, WorkerPoolConfig } from '@btc-vision/bitcoin';
import type { UniversalSigner } from '@btc-vision/ecpair';
import type { QuantumBIP32Interface } from '@btc-vision/bip32';
import type { ChainId } from '../../network/ChainId.js';
import type { AddressRotationConfigBase } from '../../signer/IRotationSigner.js';

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

    /**
     * Parallel signing configuration using worker threads.
     * Pass a WorkerSigningPool instance (recommended for reuse) or a WorkerPoolConfig.
     * When provided, key-path taproot inputs are signed in parallel.
     * Falls back to sequential for address rotation, browser, or non-taproot inputs.
     */
    readonly parallelSigning?: SigningPoolLike | WorkerPoolConfig;
}
