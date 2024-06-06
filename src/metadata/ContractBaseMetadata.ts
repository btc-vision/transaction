import { Address } from '@btc-vision/bsi-binary';
import { Network, networks } from 'bitcoinjs-lib';

export abstract class ContractBaseMetadata {
    protected abstract readonly address: Address;

    protected constructor(protected network: Network = networks.bitcoin) {}

    /**
     * @description Get the contract address
     * @param {Network} network - The network to get the address for
     */
    public static getAddress(network: Network = networks.bitcoin): Address {
        throw new Error('Method not implemented.');
    }

    /**
     * @description Get the contract address
     */
    public getAddress(): Address {
        return this.address;
    }
}
