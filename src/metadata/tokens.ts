import { Address } from '@btc-vision/bsi-binary';
import { ChainId } from '../network/ChainId.js';

// Addresses Regtest
export const FACTORY_ADDRESS_REGTEST: Address = 'bcrt1qxtpreq8zg7pp9wm550kjrhaa2r5kj6lhph9he5';
export const POOL_ADDRESS_REGTEST: Address = 'bcrt1qqg2a8076rwuruzetdyquj8fh5jxtc22pmh9vep';
export const WBTC_ADDRESS_REGTEST: Address = 'bcrt1qdr7sjgtnudda8zrfklw8l5cnrxum5hns7e46hf';
export const MOTO_ADDRESS_REGTEST: Address = 'bcrt1q8reuxx9naek4mqesrfsgdpjv3q7a5g2llkh6ua';
export const ROUTER_ADDRESS_REGTEST: Address = 'bcrt1qplnz54sca73t8a03nh494jatr9ffjg6ecarrj8';

// Addresses Testnet
export const FACTORY_ADDRESS_TESTNET: Address = 'tb1qgev5kldhp5zvg6j8t9vl6x4phkrwn8nk9felxh';
export const POOL_ADDRESS_TESTNET: Address = 'tb1q6a7yw353hjmresphupytw5vczpqxtg4yrupayk';
export const WBTC_ADDRESS_TESTNET: Address = 'tb1qp28xna6pv47x6wflcplhu0a9hkld5shtvjx6xv';
export const MOTO_ADDRESS_TESTNET: Address = 'tb1q4tyhf8hpu04qjj3qaag20knun0spctultxzakw';
export const ROUTER_ADDRESS_TESTNET: Address = 'tb1qnh9mj95nnej25dwhjvvsppwmdm0myhxv7tllgt';

// Addresses Fractal
export const FACTORY_ADDRESS_FRACTAL: Address = 'bc1q4h9l3ul7d06sne768y5r8jv9qvmx3jrzvdjpj5';
export const POOL_ADDRESS_FRACTAL: Address = 'bc1q3x6pfdvz647t7rq5zdzsy62qw5cgld092sfxsy';
export const WBTC_ADDRESS_FRACTAL: Address = 'bc1qeras4z6y2nx5ugqckx90wxdd02uyh8mdqptfhs';
export const MOTO_ADDRESS_FRACTAL: Address = 'bc1q7xnvxz7tjxdhhp7wj2dp2qm5m9sz8mveueq649';
export const ROUTER_ADDRESS_FRACTAL: Address = 'bc1qc8ysj702pktdc8rlxjxn3kslqnk3g7mavaa0ef';

export enum OPNetNetwork {
    Mainnet = 'mainnet',
    Testnet = 'testnet',
    Regtest = 'regtest',
}

export interface OPNetTokenMetadata {
    readonly factory: Address;
    readonly pool: Address;
    readonly wbtc: Address;
    readonly moto: Address;
    readonly router: Address;
}

export class OPNetTokenAddressManager {
    private readonly metadata: {
        [key in ChainId]: { [key in OPNetNetwork]?: OPNetTokenMetadata };
    } = {
        [ChainId.Bitcoin]: {
            [OPNetNetwork.Testnet]: {
                factory: FACTORY_ADDRESS_TESTNET,
                pool: POOL_ADDRESS_TESTNET,
                wbtc: WBTC_ADDRESS_TESTNET,
                moto: MOTO_ADDRESS_TESTNET,
                router: ROUTER_ADDRESS_TESTNET,
            },
            [OPNetNetwork.Regtest]: {
                factory: FACTORY_ADDRESS_REGTEST,
                pool: POOL_ADDRESS_REGTEST,
                wbtc: WBTC_ADDRESS_REGTEST,
                moto: MOTO_ADDRESS_REGTEST,
                router: ROUTER_ADDRESS_REGTEST,
            },
        },
        [ChainId.Fractal]: {
            [OPNetNetwork.Mainnet]: {
                factory: FACTORY_ADDRESS_FRACTAL,
                pool: POOL_ADDRESS_FRACTAL,
                wbtc: WBTC_ADDRESS_FRACTAL,
                moto: MOTO_ADDRESS_FRACTAL,
                router: ROUTER_ADDRESS_FRACTAL,
            },
        },
    };

    public getFactoryAddress(network: OPNetNetwork, chainId: ChainId): Address {
        const address = this.metadata[chainId][network]?.factory;

        if (!address) {
            throw new Error(
                `Factory address not found for network ${network} and chainId ${chainId}`,
            );
        }

        return address;
    }

    public getPoolAddress(network: OPNetNetwork, chainId: ChainId): Address {
        const address = this.metadata[chainId][network]?.pool;

        if (!address) {
            throw new Error(`Pool address not found for network ${network} and chainId ${chainId}`);
        }

        return address;
    }

    public getWBTCAddress(network: OPNetNetwork, chainId: ChainId): Address {
        const address = this.metadata[chainId][network]?.wbtc;

        if (!address) {
            throw new Error(`WBTC address not found for network ${network} and chainId ${chainId}`);
        }

        return address;
    }

    public getMOTOAddress(network: OPNetNetwork, chainId: ChainId): Address {
        const address = this.metadata[chainId][network]?.moto;

        if (!address) {
            throw new Error(`MOTO address not found for network ${network} and chainId ${chainId}`);
        }

        return address;
    }

    public getRouterAddress(network: OPNetNetwork, chainId: ChainId): Address {
        const address = this.metadata[chainId][network]?.router;

        if (!address) {
            throw new Error(
                `Router address not found for network ${network} and chainId ${chainId}`,
            );
        }

        return address;
    }

    public getAddresses(network: OPNetNetwork, chainId: ChainId): OPNetTokenMetadata {
        const metadata = this.metadata[chainId][network];

        if (!metadata) {
            throw new Error(`Metadata not found for network ${network} and chainId ${chainId}`);
        }

        return metadata;
    }
}

export const OPNetMetadata: OPNetTokenAddressManager = new OPNetTokenAddressManager();
