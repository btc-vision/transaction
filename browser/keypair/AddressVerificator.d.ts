import { networks } from 'bitcoinjs-lib';
import { Address } from '@btc-vision/bsi-binary';
export declare class AddressVerificator {
    static isValidP2TRAddress(inAddress: Address, network: networks.Network): boolean;
    static validatePKHAddress(inAddress: string, network: networks.Network): boolean;
}
