import { Network } from 'bitcoinjs-lib';
import { ContractBaseMetadata } from '../ContractBaseMetadata.js';
import { Address } from '@btc-vision/bsi-binary';
import { ChainId } from '../../network/ChainId.js';
export declare class wBTC extends ContractBaseMetadata {
    protected network: Network;
    readonly tokenName: string;
    readonly tokenSymbol: string;
    readonly decimals: number;
    protected readonly address: Address;
    constructor(network?: Network, chainId?: ChainId);
    static getAddress(network?: Network, chainId?: ChainId): Address;
    private static getWBTCAddressForChain;
}
