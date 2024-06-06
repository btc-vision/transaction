import { Address } from '@btc-vision/bsi-binary';
import { Network } from 'bitcoinjs-lib';
export declare abstract class ContractBaseMetadata {
    protected network: Network;
    protected abstract readonly address: Address;
    protected constructor(network?: Network);
    static getAddress(network?: Network): Address;
    getAddress(): Address;
}
