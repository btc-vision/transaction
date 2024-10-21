import { address, initEccLib, Network } from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { EcKeyPair } from './EcKeyPair.js';

initEccLib(ecc);

export enum AddressTypes {
    P2PKH = 'P2PKH',
    P2SH = 'P2SH',
    P2SH_P2WPKH = 'P2SH-P2WPKH',
    P2SH_OR_P2SH_P2WPKH = 'P2SH_OR_P2SH-P2WPKH',
    P2PK = 'P2PK',
    P2TR = 'P2TR',
    P2WPKH = 'P2WPKH',
}

export class AddressVerificator {
    /**
     * Checks if the given address is a valid P2PKH address.
     * @param inAddress - The address to check.
     * @param network - The network to validate against.
     * @returns - True if the address is a valid P2PKH address, false otherwise.
     * @remarks This method is useful for validating legacy addresses (P2PKH) without
     */
    public static isValidP2TRAddress(inAddress: string, network: Network): boolean {
        if (!inAddress || inAddress.length < 50) return false;

        let isValidTapRootAddress: boolean = false;
        try {
            address.toOutputScript(inAddress, network);

            const decodedAddress = address.fromBech32(inAddress);
            isValidTapRootAddress = decodedAddress.version === 1;
        } catch {}

        return isValidTapRootAddress;
    }

    /**
     * Checks if the given address is a valid P2PKH address.
     * @param inAddress - The address to check.
     * @param network - The network to validate against.
     * @returns - True if the address is a valid P2PKH address, false otherwise.
     * @remarks This method is useful for validating legacy addresses (P2PKH) without
     */
    public static isP2WPKHAddress(inAddress: string, network: Network): boolean {
        if (!inAddress || inAddress.length < 20 || inAddress.length > 50) return false;

        let isValidSegWitAddress: boolean = false;
        try {
            // Decode the address using Bech32
            const decodedAddress = address.fromBech32(inAddress);

            // Ensure the decoded address matches the provided network
            address.toOutputScript(inAddress, network);

            // Check if the address is P2WPKH (version 0)
            isValidSegWitAddress =
                decodedAddress.version === 0 && decodedAddress.data.length === 20;
        } catch {}

        return isValidSegWitAddress;
    }

    /**
     * Checks if the given address is a valid P2PKH or P2SH address.
     * @param addy - The address to check.
     * @param network - The network to validate against.
     * @returns - True if the address is a valid P2PKH or P2SH address, false otherwise.
     * @remarks This method is useful for validating legacy addresses (P2PKH or P2SH) without
     */
    public static isP2PKHOrP2SH(addy: string, network: Network): boolean {
        try {
            // First, try to decode as a Base58Check address (P2PKH, P2SH, or P2SH-P2WPKH)
            const decodedBase58 = address.fromBase58Check(addy);

            if (decodedBase58.version === network.pubKeyHash) {
                // P2PKH: Legacy address (starting with '1' for mainnet, 'm/n' for testnet)
                return true;
            }

            return decodedBase58.version === network.scriptHash;
        } catch (error) {
            // If decoding fails or version is not valid, it's not a valid legacy address
            return false;
        }
    }

    /**
     * Checks if the input is a valid hexadecimal public key (P2PK).
     * Public keys can be compressed (66 characters) or uncompressed (130 characters).
     *
     * @param input - The input string to check.
     * @param network - The Bitcoin network to validate against (mainnet, testnet, etc.).
     * @returns - True if the input is a valid public key, false otherwise.
     */
    public static isValidPublicKey(input: string, network: Network): boolean {
        try {
            if (input.startsWith('0x')) {
                input = input.slice(2);
            }

            // Compressed public keys are 66 characters long (0x02 or 0x03 prefix + 32 bytes)
            // Uncompressed public keys are 130 characters long (0x04 prefix + 64 bytes)
            const hexRegex = /^[0-9a-fA-F]+$/;
            if (!hexRegex.test(input)) {
                return false;
            }

            if (input.length === 64) {
                return true;
            }

            if (input.length === 66 || input.length === 130) {
                // Check if the input can be parsed as a valid public key
                const pubKeyBuffer = Buffer.from(input, 'hex');
                EcKeyPair.fromPublicKey(pubKeyBuffer, network);

                return true;
            }
        } catch {
            return false;
        }

        return false; // Not a valid public key
    }

    /**
     * Validates if a given Bitcoin address is of the specified type and network.
     * - P2PKH (Legacy address starting with '1' for mainnet or 'm/n' for testnet)
     * - P2SH (Legacy address starting with '3' for mainnet or '2' for testnet)
     * - P2SH-P2WPKH (Wrapped SegWit)
     * - P2PK (Pay to PubKey, technically treated similarly to P2PKH)
     * - P2WPKH (SegWit address starting with 'bc1q' for mainnet or 'tb1q' for testnet)
     * - P2TR (Taproot address starting with 'bc1p' for mainnet or 'tb1p' for testnet)
     *
     * @param addy - The Bitcoin address to validate.
     * @param network - The Bitcoin network to validate against (mainnet, testnet, etc.).
     * @returns - The type of the valid Bitcoin address, or null if invalid.
     */
    public static validateBitcoinAddress(addy: string, network: Network): AddressTypes | null {
        if (AddressVerificator.isValidPublicKey(addy, network)) {
            return AddressTypes.P2PK;
        }

        try {
            // First, try to decode as a Base58Check address (P2PKH, P2SH, or P2SH-P2WPKH)
            const decodedBase58 = address.fromBase58Check(addy);

            if (decodedBase58.version === network.pubKeyHash) {
                // P2PKH: Legacy address (starting with '1' for mainnet, 'm/n' for testnet)
                return AddressTypes.P2PKH;
            }
            if (decodedBase58.version === network.scriptHash) {
                // P2SH: Could be P2SH (general) or P2SH-P2WPKH (wrapped SegWit)
                return AddressTypes.P2SH_OR_P2SH_P2WPKH;
            }
        } catch {}

        try {
            // Try to decode as a Bech32 or Bech32m address (P2WPKH or P2TR)
            const decodedBech32 = address.fromBech32(addy);

            if (decodedBech32.prefix === network.bech32) {
                // P2WPKH: SegWit address (starting with 'bc1q' for mainnet, 'tb1q' for testnet)
                if (decodedBech32.version === 0 && decodedBech32.data.length === 20) {
                    return AddressTypes.P2WPKH;
                }
                // P2TR: Taproot address (starting with 'bc1p' for mainnet, 'tb1p' for testnet)
                if (decodedBech32.version === 1 && decodedBech32.data.length === 32) {
                    return AddressTypes.P2TR;
                }
            }
        } catch {}

        return null; // Not a valid or recognized Bitcoin address type
    }
}
