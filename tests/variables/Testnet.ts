import { NetworkInformation } from '../../src/network/NetworkInformation.js';
import { BitcoinNetwork } from '@btc-vision/bsi-common';

export const Testnet: NetworkInformation = {
    wallet: {
        address: 'tb1qcfszz8dcvsz9mcp70ezw5zy2r3ydr0cfz60d3t',
        privateKey: 'cSZU2QB9aUYvaL6ukU9d3DKq7QaxTRms1BCQnx5vqXbxBk4bdBc4',
        publicKey: '026764d622f083d78f47c2f2a007ab08e96edf398de74acc0251a7bba202ffb92b',
    },

    config: {
        BITCOIND_NETWORK: BitcoinNetwork.TestNet,
        BITCOIND_HOST: '51.81.67.34',
        BITCOIND_PORT: 9237,

        BITCOIND_USERNAME: 'HJSiowseujhs',
        BITCOIND_PASSWORD: 'YHEFHSDJ23JOIhjjef2ied9u290efu2930u90U',
    },
};
