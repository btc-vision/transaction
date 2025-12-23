import { Signer } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';

/**
 * Base signer type for address rotation.
 * This is the minimal interface required for UTXO signing.
 * UnisatSigner extends this through the CustomKeypair base class.
 */
export type RotationSignerBase = Signer | ECPairInterface;

/**
 * Map of addresses to their respective signers for address rotation mode.
 * Each UTXO address can have its own dedicated signer.
 */
export type SignerMapBase = Map<string, RotationSignerBase>;

/**
 * Configuration for address rotation mode (base version without browser signers).
 * When enabled, each UTXO can be signed by a different signer based on its address.
 */
export interface AddressRotationConfigBase {
    /**
     * Whether address rotation mode is enabled.
     * When true, the signerMap will be used to find the appropriate signer for each UTXO.
     * When false, the default single signer will be used for all inputs.
     */
    readonly enabled: boolean;

    /**
     * Map of addresses to their respective signers.
     * The key is the address (from UTXO.scriptPubKey.address).
     * The value is the signer that controls that address.
     */
    readonly signerMap: SignerMapBase;
}
