/// <reference types="node" />
import { Network } from 'bitcoinjs-lib';
import { Address } from '@btc-vision/bsi-binary';
export declare class P2TR_MS {
    static generateMultiSigAddress(pubKeys: Buffer[], minimumSignatureRequired: number, network?: Network): Address;
}
