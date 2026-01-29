import { address, fromHex, initEccLib, type Network, payments, type Script } from '@btc-vision/bitcoin';
import { eccLib } from '../ecc/backend.js';
import { EcKeyPair } from './EcKeyPair.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';
import { P2WDADetector } from '../p2wda/P2WDADetector.js';
import { MLDSASecurityLevel } from '@btc-vision/bip32';

initEccLib(eccLib);

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
    readonly publicKey?: Uint8Array;
    readonly error?: string;
}

export class AddressVerificator {
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

    public static isP2WPKHAddress(inAddress: string, network: Network): boolean {
        if (!inAddress || inAddress.length < 20 || inAddress.length > 50) return false;

        let isValidSegWitAddress: boolean = false;
        try {
            const decodedAddress = address.fromBech32(inAddress);
            address.toOutputScript(inAddress, network);

            isValidSegWitAddress =
                decodedAddress.version === 0 && decodedAddress.data.length === 20;
        } catch {}

        return isValidSegWitAddress;
    }

    public static isP2WDAWitnessScript(witnessScript: Uint8Array): boolean {
        return P2WDADetector.isP2WDAWitnessScript(witnessScript);
    }

    public static isP2PKHOrP2SH(addy: string, network: Network): boolean {
        try {
            const decodedBase58 = address.fromBase58Check(addy);

            if (decodedBase58.version === network.pubKeyHash) {
                return true;
            }

            return decodedBase58.version === network.scriptHash;
        } catch (error) {
            return false;
        }
    }

    public static isValidPublicKey(input: string, network: Network): boolean {
        try {
            if (input.startsWith('0x')) {
                input = input.slice(2);
            }

            if (!BitcoinUtils.isValidHex(input)) {
                return false;
            }

            if (input.length === 64) {
                return true;
            }

            const pubKeyBuffer = fromHex(input);
            if ((input.length === 130 && pubKeyBuffer[0] === 0x06) || pubKeyBuffer[0] === 0x07) {
                return true;
            }

            if (input.length === 66 || input.length === 130) {
                EcKeyPair.fromPublicKey(pubKeyBuffer, network);

                return true;
            }
        } catch (e) {
            return false;
        }

        return false;
    }

    public static isValidMLDSAPublicKey(input: string | Uint8Array): MLDSASecurityLevel | null {
        try {
            let byteLength: number;

            if (typeof input !== 'string' && input instanceof Uint8Array) {
                byteLength = input.length;
            } else {
                if (input.startsWith('0x')) {
                    input = input.slice(2);
                }

                if (!BitcoinUtils.isValidHex(input)) {
                    return null;
                }

                byteLength = input.length / 2;
            }

            switch (byteLength) {
                case 1312:
                    return MLDSASecurityLevel.LEVEL2;
                case 1952:
                    return MLDSASecurityLevel.LEVEL3;
                case 2592:
                    return MLDSASecurityLevel.LEVEL5;
                default:
                    return null;
            }
        } catch (e) {
            return null;
        }
    }

    public static isValidP2OPAddress(inAddress: string, network: Network): boolean {
        if (!inAddress || inAddress.length < 20) return false;

        try {
            const decodedAddress = address.fromBech32(inAddress);

            const validPrefix =
                decodedAddress.prefix === network.bech32 ||
                decodedAddress.prefix === network.bech32Opnet;

            if (!validPrefix) {
                return false;
            }

            return decodedAddress.version === 16 && decodedAddress.data.length === 21;
        } catch {
            return false;
        }
    }

    public static requireRedeemScript(addy: string, network: Network): boolean {
        try {
            const decodedBase58 = address.fromBase58Check(addy);

            if (decodedBase58.version === network.pubKeyHash) {
                return false;
            }

            return decodedBase58.version === network.scriptHash;
        } catch {
            return false;
        }
    }

    public static detectAddressType(addy: string, network: Network): AddressTypes | null {
        if (AddressVerificator.isValidPublicKey(addy, network)) {
            return AddressTypes.P2PK;
        }

        try {
            const decodedBase58 = address.fromBase58Check(addy);
            if (decodedBase58.version === network.pubKeyHash) {
                return AddressTypes.P2PKH;
            }

            if (decodedBase58.version === network.scriptHash) {
                return AddressTypes.P2SH_OR_P2SH_P2WPKH;
            }
        } catch {}

        try {
            const decodedBech32 = address.fromBech32(addy);

            if (
                (decodedBech32.prefix === network.bech32Opnet ||
                    decodedBech32.prefix === network.bech32) &&
                decodedBech32.version === 16 &&
                decodedBech32.data.length === 21
            ) {
                return AddressTypes.P2OP;
            }

            if (decodedBech32.prefix === network.bech32) {
                if (decodedBech32.version === 0 && decodedBech32.data.length === 20) {
                    return AddressTypes.P2WPKH;
                }

                if (decodedBech32.version === 0 && decodedBech32.data.length === 32) {
                    return AddressTypes.P2WSH;
                }

                if (decodedBech32.version === 1 && decodedBech32.data.length === 32) {
                    return AddressTypes.P2TR;
                }
            }
        } catch {}

        return null;
    }

    public static detectAddressTypeWithWitnessScript(
        addy: string,
        network: Network,
        witnessScript?: Uint8Array,
    ): AddressTypes | null {
        const baseType = AddressVerificator.detectAddressType(addy, network);

        if (baseType === AddressTypes.P2WSH && witnessScript) {
            if (AddressVerificator.isP2WDAWitnessScript(witnessScript)) {
                return AddressTypes.P2WDA;
            }
        }

        return baseType;
    }

    public static validateP2WDAAddress(
        address: string,
        network: Network,
        witnessScript?: Uint8Array,
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
                redeem: { output: witnessScript as Script },
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
