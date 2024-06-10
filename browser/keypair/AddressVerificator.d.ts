import bitcoin from 'bitcoinjs-lib';
export declare class AddressVerificator {
    static isValidP2TRAddress(address: string, network: bitcoin.networks.Network): boolean;
    static validatePKHAddress(address: string, network: bitcoin.networks.Network): boolean;
}
