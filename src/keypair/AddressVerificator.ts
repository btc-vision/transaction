import { address, initEccLib, networks } from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { Address } from '@btc-vision/bsi-binary';

initEccLib(ecc);

export class AddressVerificator {
    public static isValidP2TRAddress(inAddress: Address, network: networks.Network): boolean {
        if (!inAddress || inAddress.length < 50) return false;

        let isValidTapRootAddress: boolean = false;
        try {
            address.toOutputScript(inAddress, network);

            const decodedAddress = address.fromBech32(inAddress);
            isValidTapRootAddress = decodedAddress.version === 1;
        } catch (e) {}

        return isValidTapRootAddress;
    }

    public static validatePKHAddress(inAddress: string, network: networks.Network): boolean {
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
        } catch (e) {}

        return isValidSegWitAddress;
    }
}
