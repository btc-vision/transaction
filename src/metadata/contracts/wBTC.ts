import { Network, networks } from 'bitcoinjs-lib';
import { ChainId } from '../../network/ChainId.js';
import { ContractBaseMetadata } from '../ContractBaseMetadata.js';
import { WBTC_ADDRESS_FRACTAL, WBTC_ADDRESS_REGTEST, WBTC_ADDRESS_TESTNET } from '../tokens.js';

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

    protected readonly address: string;

    constructor(
        protected network: Network = networks.bitcoin,
        chainId: ChainId = ChainId.Bitcoin,
    ) {
        super(network);

        this.address = wBTC.getAddress(network, chainId);
    }

    public static getAddress(network: Network = networks.bitcoin, chainId?: ChainId): string {
        switch (network.bech32) {
            case networks.bitcoin.bech32:
                return this.getWBTCAddressForChain(chainId ?? ChainId.Bitcoin);
            case networks.regtest.bech32:
                return WBTC_ADDRESS_REGTEST;
            case networks.testnet.bech32:
                return WBTC_ADDRESS_TESTNET;
            default:
                throw new Error(`Invalid network: ${network.bech32}`);
        }
    }

    private static getWBTCAddressForChain(chainId: ChainId): string {
        switch (chainId) {
            case ChainId.Bitcoin:
                return 'unknown';
            case ChainId.Fractal:
                return WBTC_ADDRESS_FRACTAL;
            default:
                throw new Error(`Invalid chainId: ${chainId}`);
        }
    }
}
