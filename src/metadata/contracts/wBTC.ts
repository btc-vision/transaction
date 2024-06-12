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
                return 'bcrt1qmsx5vpm6yfwtex5ygag0nwktnmj7a48eew2qn0';
            case networks.testnet.bech32:
                return 'tb1qs4d69qpw57cm3pxyeuamenkv0aswtnhpgxry06';
            default:
                throw new Error(`Invalid network: ${network}`);
        }
    }
}
