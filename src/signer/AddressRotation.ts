import { Signer } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import { UnisatSigner } from '../transaction/browser/extensions/UnisatSigner.js';

/**
 * Supported signer types for address rotation
 */
export type RotationSigner = Signer | ECPairInterface | UnisatSigner;

/**
 * Map of addresses to their respective signers for address rotation mode.
 * Each UTXO address can have its own dedicated signer.
 */
export type SignerMap = Map<string, RotationSigner>;

/**
 * Configuration for address rotation mode.
 * When enabled, each UTXO can be signed by a different signer based on its address.
 */
export interface AddressRotationConfig {
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
    readonly signerMap: SignerMap;
}

/**
 * Creates a new SignerMap from an array of address-signer pairs.
 * @param pairs - Array of [address, signer] tuples
 * @returns A SignerMap ready for use with address rotation
 */
export function createSignerMap(
    pairs: ReadonlyArray<readonly [string, RotationSigner]>,
): SignerMap {
    return new Map(pairs);
}

/**
 * Creates an AddressRotationConfig with the given signers.
 * @param signers - Map or array of address-signer pairs
 * @returns AddressRotationConfig ready for use
 */
export function createAddressRotation(
    signers: SignerMap | ReadonlyArray<readonly [string, RotationSigner]>,
): AddressRotationConfig {
    const signerMap = signers instanceof Map ? signers : createSignerMap(signers);

    return {
        enabled: true,
        signerMap,
    };
}

/**
 * Creates a disabled address rotation config (single signer mode).
 * @returns AddressRotationConfig with rotation disabled
 */
export function disabledAddressRotation(): AddressRotationConfig {
    return {
        enabled: false,
        signerMap: new Map(),
    };
}
