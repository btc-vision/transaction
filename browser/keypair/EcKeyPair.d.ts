/// <reference types="node" />
import { BIP32Interface } from 'bip32';
import { Network } from 'bitcoinjs-lib';
import { ECPairInterface } from 'ecpair';
import { Address } from '@btc-vision/bsi-binary';
import { IWallet } from './interfaces/IWallet.js';
export declare class EcKeyPair {
    static BIP32: any;
    static ECPair: import("ecpair").ECPairAPI;
    static fromWIF(wif: string, network?: Network): ECPairInterface;
    static fromPrivateKey(privateKey: Buffer, network?: Network): ECPairInterface;
    static fromPublicKey(publicKey: Buffer, network?: Network): ECPairInterface;
    static generateMultiSigAddress(pubKeys: Buffer[], minimumSignatureRequired: number, network?: Network): Address;
    static verifyPubKeys(pubKeys: Buffer[], network?: Network): Buffer[];
    static getP2WPKHAddress(keyPair: ECPairInterface, network?: Network): Address;
    static generateWallet(network?: Network): IWallet;
    static verifyContractAddress(contractAddress: Address, network?: Network): boolean;
    static getLegacyAddress(keyPair: ECPairInterface, network?: Network): Address;
    static generateRandomKeyPair(network?: Network): ECPairInterface;
    static fromSeed(seed: Buffer, network?: Network): BIP32Interface;
    static getTaprootAddress(keyPair: ECPairInterface, network?: Network): Address;
    static getTaprootAddressFromAddress(inAddr: Address, network?: Network): Address;
    static fromSeedKeyPair(seed: Buffer, network?: Network): ECPairInterface;
}
