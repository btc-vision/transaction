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
        switch (network) {
            case networks.bitcoin:
                return 'bcrt1pcw0828yjrtlrc6mkp3lkq30j7wc7slsh7k7dyh53mrs4f8d74l6qumhqp4';
            case networks.regtest:
                return 'bcrt1pcw0828yjrtlrc6mkp3lkq30j7wc7slsh7k7dyh53mrs4f8d74l6qumhqp4';
            case networks.testnet:
                return 'tb1pq64lx73fwyrdp4asvl7xt5r5qvxvt9wy82x75taqtzvd64f58nasansurj';
            default:
                throw new Error(`Invalid network: ${network}`);
        }
    }
}
