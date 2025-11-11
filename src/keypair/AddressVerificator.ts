import { address, initEccLib, Network, payments } from '@btc-vision/bitcoin';
import * as ecc from '@bitcoinerlab/secp256k1';
import { EcKeyPair } from './EcKeyPair.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';
import { P2WDADetector } from '../p2wda/P2WDADetector.js';
import { MLDSASecurityLevel } from '@btc-vision/bip32';

initEccLib(ecc);

export enum AddressTypes {
    P2PKH = 'P2PKH',
    P2OP = 'P2OP',
    P2SH_OR_P2SH_P2WPKH = 'P2SH_OR_P2SH-P2WPKH',
    P2PK = 'P2PK',
    P2TR = 'P2TR',
    P2WPKH = 'P2WPKH',
    P2WSH = 'P2WSH',
    P2WDA = 'P2WDA',
}

export interface ValidatedP2WDAAddress {
    readonly isValid: boolean;
    readonly isPotentiallyP2WDA: boolean;
    readonly isDefinitelyP2WDA: boolean;
    readonly publicKey?: Buffer;
    readonly error?: string;
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
     * Check if a given witness script is a P2WDA witness script
     *
     * P2WDA witness scripts have a specific pattern:
     * (OP_2DROP * 5) <pubkey> OP_CHECKSIG
     *
     * This pattern allows for 10 witness data fields (5 * 2 = 10),
     * which can be used to embed authenticated operation data.
     *
     * @param witnessScript The witness script to check
     * @returns true if this is a valid P2WDA witness script
     */
    public static isP2WDAWitnessScript(witnessScript: Buffer): boolean {
        return P2WDADetector.isP2WDAWitnessScript(witnessScript);
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
            if (!BitcoinUtils.isValidHex(input)) {
                return false;
            }

            if (input.length === 64) {
                return true;
            }

            const pubKeyBuffer = Buffer.from(input, 'hex');
            if ((input.length === 130 && pubKeyBuffer[0] === 0x06) || pubKeyBuffer[0] === 0x07) {
                return true;
            }

            if (input.length === 66 || input.length === 130) {
                // Check if the input can be parsed as a valid public key
                EcKeyPair.fromPublicKey(pubKeyBuffer, network);

                return true;
            }
        } catch (e) {
            return false;
        }

        return false; // Not a valid public key
    }

    /**
     * Checks if the input is a valid ML-DSA public key.
     * ML-DSA public keys have specific lengths depending on the security level:
     * - ML-DSA-44 (Level 2): 1312 bytes (2624 hex characters)
     * - ML-DSA-65 (Level 3): 1952 bytes (3904 hex characters)
     * - ML-DSA-87 (Level 5): 2592 bytes (5184 hex characters)
     *
     * @param input - The input string (hex format) or Buffer to check.
     * @returns - The security level if valid, null otherwise.
     */
    public static isValidMLDSAPublicKey(input: string | Buffer | Uint8Array): MLDSASecurityLevel | null {
        try {
            let byteLength: number;

            if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
                byteLength = input.length;
            } else {
                // Handle string input
                if (input.startsWith('0x')) {
                    input = input.slice(2);
                }

                if (!BitcoinUtils.isValidHex(input)) {
                    return null;
                }

                byteLength = input.length / 2;
            }

            // Check against valid ML-DSA public key lengths
            switch (byteLength) {
                case 1312:
                    return MLDSASecurityLevel.LEVEL2; // ML-DSA-44
                case 1952:
                    return MLDSASecurityLevel.LEVEL3; // ML-DSA-65
                case 2592:
                    return MLDSASecurityLevel.LEVEL5; // ML-DSA-87
                default:
                    return null;
            }
        } catch (e) {
            return null;
        }
    }

    /**
     * Checks if the given address is a valid P2OP (OPNet) address.
     * P2OP addresses use witness version 16 and are encoded in Bech32m format.
     *
     * @param inAddress - The address to check.
     * @param network - The network to validate against.
     * @returns - True if the address is a valid P2OP address, false otherwise.
     */
    public static isValidP2OPAddress(inAddress: string, network: Network): boolean {
        if (!inAddress || inAddress.length < 20) return false;

        try {
            // Decode the Bech32/Bech32m address
            const decodedAddress = address.fromBech32(inAddress);

            // Check if it matches the network's bech32 or bech32Opnet prefix
            const validPrefix =
                decodedAddress.prefix === network.bech32 ||
                decodedAddress.prefix === network.bech32Opnet;

            if (!validPrefix) {
                return false;
            }

            // P2OP uses witness version 16 (OP_16)
            // The data length should be 21 bytes (1 byte deployment version + 20 byte hash160)
            return decodedAddress.version === 16 && decodedAddress.data.length === 21;
        } catch {
            return false;
        }
    }

    /**
     * Checks if the address requires a redeem script to spend funds.
     * @param {string} addy - The address to check.
     * @param {Network} network - The network to validate against.
     * @returns {boolean} - True if the address requires a redeem script, false otherwise.
     */
    public static requireRedeemScript(addy: string, network: Network): boolean {
        try {
            // First, try to decode as a Base58Check address (P2PKH, P2SH, or P2SH-P2WPKH)
            const decodedBase58 = address.fromBase58Check(addy);

            if (decodedBase58.version === network.pubKeyHash) {
                return false;
            }

            return decodedBase58.version === network.scriptHash;
        } catch {
            return false;
        }
    }

    /**
     * Validates if a given Bitcoin address is of the specified type and network.
     * - P2PKH (Legacy address starting with '1' for mainnet or 'm/n' for testnet)
     * - P2SH (Legacy address starting with '3' for mainnet or '2' for testnet)
     * - P2SH-P2WPKH (Wrapped SegWit)
     * - P2PK (Pay to PubKey, technically treated similarly to P2PKH)
     * - P2WPKH (SegWit address starting with 'bc1q' for mainnet or 'tb1q' for testnet)
     * - P2WSH (SegWit script hash address)
     * - P2TR (Taproot address starting with 'bc1p' for mainnet or 'tb1p' for testnet)
     * - P2OP (OPNet contract address with witness version 16)
     *
     * @param addy - The Bitcoin address to validate.
     * @param network - The Bitcoin network to validate against (mainnet, testnet, etc.).
     * @returns - The type of the valid Bitcoin address, or null if invalid.
     */
    public static detectAddressType(addy: string, network: Network): AddressTypes | null {
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
            // Try to decode as a Bech32 or Bech32m address (P2WPKH, P2WSH, P2TR, or P2OP)
            const decodedBech32 = address.fromBech32(addy);

            // P2OP: OPNet contract addresses (version 16, 21 bytes data)
            if (
                (decodedBech32.prefix === network.bech32Opnet ||
                    decodedBech32.prefix === network.bech32) &&
                decodedBech32.version === 16 &&
                decodedBech32.data.length === 21
            ) {
                return AddressTypes.P2OP;
            }

            if (decodedBech32.prefix === network.bech32) {
                // P2WPKH: SegWit address (20 bytes)
                if (decodedBech32.version === 0 && decodedBech32.data.length === 20) {
                    return AddressTypes.P2WPKH;
                }

                // P2WSH: SegWit script hash (32 bytes)
                if (decodedBech32.version === 0 && decodedBech32.data.length === 32) {
                    return AddressTypes.P2WSH;
                }

                // P2TR: Taproot address (starting with 'bc1p' for mainnet, 'tb1p' for testnet)
                if (decodedBech32.version === 1 && decodedBech32.data.length === 32) {
                    return AddressTypes.P2TR;
                }
            }
        } catch {}

        return null; // Not a valid or recognized Bitcoin address type
    }

    /**
     * Enhanced detectAddressType that provides hints about P2WDA
     *
     * Note: P2WDA addresses cannot be distinguished from regular P2WSH
     * addresses without the witness script. When a P2WSH address is detected,
     * it could potentially be P2WDA if it has the correct witness script.
     *
     * @param addy The address to analyze
     * @param network The Bitcoin network
     * @param witnessScript Optional witness script for P2WSH addresses
     * @returns The address type, with P2WDA detection if witness script provided
     */
    public static detectAddressTypeWithWitnessScript(
        addy: string,
        network: Network,
        witnessScript?: Buffer,
    ): AddressTypes | null {
        const baseType = AddressVerificator.detectAddressType(addy, network);

        if (baseType === AddressTypes.P2WSH && witnessScript) {
            if (AddressVerificator.isP2WDAWitnessScript(witnessScript)) {
                return AddressTypes.P2WDA;
            }
        }

        return baseType;
    }

    /**
     * Validate a P2WDA address and extract information
     *
     * This method validates that an address is a properly formatted P2WSH
     * address and, if a witness script is provided, verifies it matches
     * the P2WDA pattern and corresponds to the address.
     *
     * @param address The address to validate
     * @param network The Bitcoin network
     * @param witnessScript Optional witness script to verify
     * @returns Validation result with extracted information
     */
    public static validateP2WDAAddress(
        address: string,
        network: Network,
        witnessScript?: Buffer,
    ): ValidatedP2WDAAddress {
        try {
            const addressType = AddressVerificator.detectAddressType(address, network);
            if (addressType !== AddressTypes.P2WSH) {
                return {
                    isValid: false,
                    isPotentiallyP2WDA: false,
                    isDefinitelyP2WDA: false,
                    error: 'Not a P2WSH address',
                };
            }

            if (!witnessScript) {
                return {
                    isValid: true,
                    isPotentiallyP2WDA: true,
                    isDefinitelyP2WDA: false,
                };
            }

            if (!AddressVerificator.isP2WDAWitnessScript(witnessScript)) {
                return {
                    isValid: true,
                    isPotentiallyP2WDA: true,
                    isDefinitelyP2WDA: false,
                    error: 'Witness script does not match P2WDA pattern',
                };
            }

            const p2wsh = payments.p2wsh({
                redeem: { output: witnessScript },
                network,
            });

            if (p2wsh.address !== address) {
                return {
                    isValid: false,
                    isPotentiallyP2WDA: false,
                    isDefinitelyP2WDA: false,
                    error: 'Witness script does not match address',
                };
            }

            const publicKey = P2WDADetector.extractPublicKeyFromP2WDA(witnessScript);
            if (!publicKey) {
                return {
                    isValid: false,
                    isPotentiallyP2WDA: false,
                    isDefinitelyP2WDA: false,
                    error: 'Failed to extract public key from witness script',
                };
            }

            return {
                isValid: true,
                isPotentiallyP2WDA: true,
                isDefinitelyP2WDA: true,
                publicKey,
            };
        } catch (error) {
            return {
                isValid: false,
                isPotentiallyP2WDA: false,
                isDefinitelyP2WDA: false,
                error: (error as Error).message,
            };
        }
    }
}
