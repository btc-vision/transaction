import { ChainId } from '../network/ChainId.js';
import { Address } from '../keypair/Address.js';

function deadAddress(): Address {
    return Address.dead();
}

// Addresses Regtest
export const FACTORY_ADDRESS_REGTEST: Address = deadAddress();
export const POOL_ADDRESS_REGTEST: Address = deadAddress();
export const WBTC_ADDRESS_REGTEST: Address = deadAddress();
export const MOTO_ADDRESS_REGTEST: Address = deadAddress();
export const ROUTER_ADDRESS_REGTEST: Address = deadAddress();

// Addresses Testnet
export const FACTORY_ADDRESS_TESTNET: Address = deadAddress();
export const POOL_ADDRESS_TESTNET: Address = deadAddress();
export const WBTC_ADDRESS_TESTNET: Address = deadAddress();
export const MOTO_ADDRESS_TESTNET: Address = deadAddress();
export const ROUTER_ADDRESS_TESTNET: Address = deadAddress();

// Addresses Fractal
export const FACTORY_ADDRESS_FRACTAL: Address = deadAddress();
export const POOL_ADDRESS_FRACTAL: Address = deadAddress();
export const WBTC_ADDRESS_FRACTAL: Address = deadAddress();
export const MOTO_ADDRESS_FRACTAL: Address = deadAddress();
export const ROUTER_ADDRESS_FRACTAL: Address = deadAddress();

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
