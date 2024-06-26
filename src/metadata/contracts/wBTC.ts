import { Network, networks } from 'bitcoinjs-lib';
import { ContractBaseMetadata } from '../ContractBaseMetadata.js';
import { Address } from '@btc-vision/bsi-binary';

/**
 * @description Wrapped Bitcoin (wBTC) contract metadata.
 * */
export class wBTC extends ContractBaseMetadata {
    /**
     * @description Token Name
     */
    public readonly tokenName: string = 'Wrapped Bitcoin';

    /**
     * @description Token Symbol
     */
    public readonly tokenSymbol: string = 'wBTC';

    /**
     * @description Token Decimals, same as Bitcoin
     */
    public readonly decimals: number = 8;

    protected readonly address: Address;

    constructor(protected network: Network = networks.bitcoin) {
        super(network);

        this.address = wBTC.getAddress(network);
    }

    public static getAddress(network: Network = networks.bitcoin): Address {
        switch (network.bech32) {
            case networks.bitcoin.bech32:
                return 'unknown';
            case networks.regtest.bech32:
                return 'bcrt1q3tklc99rj4w5x7aq5zvfryw64hqv2lneakg69y';
            case networks.testnet.bech32:
                return 'tb1qj58a6yf4pez426nqvf8wyu6ssggcajw8kr44vy';
            default:
                throw new Error(`Invalid network: ${network}`);
        }
    }
}
