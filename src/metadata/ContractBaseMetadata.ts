import { Network, networks } from '@btc-vision/bitcoin';

export abstract class ContractBaseMetadata {
    protected abstract readonly address: string;

    protected constructor(protected network: Network = networks.bitcoin) {}

    /**
     * @description Get the contract address
     * @param {Network} network - The network to get the address for
     */
    public static getAddress(network: Network = networks.bitcoin): string {
        throw new Error('Method not implemented.');
    }

    /**
     * @description Get the contract address
     */
    public getAddress(): string {
        return this.address;
    }
}
