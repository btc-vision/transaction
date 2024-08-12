import { Address } from '@btc-vision/bsi-binary';
import { ChainId } from '../network/ChainId.js';
export declare const FACTORY_ADDRESS_REGTEST: Address;
export declare const POOL_ADDRESS_REGTEST: Address;
export declare const WBTC_ADDRESS_REGTEST: Address;
export declare const MOTO_ADDRESS_REGTEST: Address;
export declare const ROUTER_ADDRESS_REGTEST: Address;
export declare const FACTORY_ADDRESS_TESTNET: Address;
export declare const POOL_ADDRESS_TESTNET: Address;
export declare const WBTC_ADDRESS_TESTNET: Address;
export declare const MOTO_ADDRESS_TESTNET: Address;
export declare const ROUTER_ADDRESS_TESTNET: Address;
export declare const FACTORY_ADDRESS_FRACTAL: Address;
export declare const POOL_ADDRESS_FRACTAL: Address;
export declare const WBTC_ADDRESS_FRACTAL: Address;
export declare const MOTO_ADDRESS_FRACTAL: Address;
export declare const ROUTER_ADDRESS_FRACTAL: Address;
export declare enum OPNetNetwork {
    Mainnet = "mainnet",
    Testnet = "testnet",
    Regtest = "regtest"
}
export interface OPNetTokenMetadata {
    readonly factory: Address;
    readonly pool: Address;
    readonly wbtc: Address;
    readonly moto: Address;
    readonly router: Address;
}
export declare class OPNetTokenAddressManager {
    private readonly metadata;
    getFactoryAddress(network: OPNetNetwork, chainId: ChainId): Address;
    getPoolAddress(network: OPNetNetwork, chainId: ChainId): Address;
    getWBTCAddress(network: OPNetNetwork, chainId: ChainId): Address;
    getMOTOAddress(network: OPNetNetwork, chainId: ChainId): Address;
    getRouterAddress(network: OPNetNetwork, chainId: ChainId): Address;
    getAddresses(network: OPNetNetwork, chainId: ChainId): OPNetTokenMetadata;
}
export declare const OPNetMetadata: OPNetTokenAddressManager;
