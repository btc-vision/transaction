/// <reference types="node" />
import { IWallet } from './interfaces/IWallet.js';
import { ECPairInterface } from 'ecpair';
import { Network } from 'bitcoinjs-lib';
import { Address } from '@btc-vision/bsi-binary';
export declare class Wallet {
    readonly network: Network;
    private readonly _keypair;
    private readonly _p2wpkh;
    private readonly _p2tr;
    private readonly _legacy;
    constructor(wallet: IWallet, network?: Network);
    get keypair(): ECPairInterface;
    get p2wpkh(): Address;
    get p2tr(): Address;
    get legacy(): Address;
    get addresses(): Address[];
    get publicKey(): Buffer;
    get xOnly(): Buffer;
    static fromWif(wif: string, network?: Network): Wallet;
}
