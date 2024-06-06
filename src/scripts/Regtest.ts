import { NetworkInformation } from '../network/NetworkInformation.js';
import { BitcoinNetwork } from '@btc-vision/bsi-common';

export const Regtest: NetworkInformation = {
    wallet: {
        address: 'bcrt1qfqsr3m7vjxheghcvw4ks0fryqxfq8qzjf8fxes',
        publicKey: '020373626d317ae8788ce3280b491068610d840c23ecb64c14075bbb9f670af52c',
        privateKey: 'cRCiYAgCBrU7hSaJBRuPqKVYXQqM5CKXbMfWHb25X4FDAWJ8Ai92',
    },

    config: {
        BITCOIND_NETWORK: BitcoinNetwork.Regtest,
        BITCOIND_HOST: '51.81.67.34',
        BITCOIND_PORT: 9242,

        BITCOIND_USERNAME: 'HJSiowseujhs',
        BITCOIND_PASSWORD: 'YHEFHSDJ23JOIhjjef2ied9u290efu2930u90U',
    },
};
