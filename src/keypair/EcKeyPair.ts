import * as ecc from '@bitcoinerlab/secp256k1';
import { Address } from '@btc-vision/bsi-binary';
import bip32, { BIP32Factory, BIP32Interface } from 'bip32';
import { address, initEccLib, Network, networks, payments } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { IWallet } from './interfaces/IWallet.js';

initEccLib(ecc);

const BIP32factory = typeof bip32 === 'function' ? bip32 : BIP32Factory;

if (!BIP32factory) {
    throw new Error('Failed to load BIP32 library');
}

/**
 * Class for handling EC key pairs
 * @class EcKeyPair
 * @module EcKeyPair
 * @typicalname EcKeyPair
 * @example import { EcKeyPair } from '@btc-vision/transaction';
 */
export class EcKeyPair {
    public static BIP32 = BIP32factory(ecc);
    public static ECPair = ECPairFactory(ecc);

    /**
     * Generate a keypair from a WIF
     * @param {string} wif - The WIF to use
     * @param {Network} network - The network to use
     * @returns {ECPairInterface} - The generated keypair
     */
    public static fromWIF(wif: string, network: Network = networks.bitcoin): ECPairInterface {
        return this.ECPair.fromWIF(wif, network);
    }

    /**
     * Generate a keypair from a private key
     * @param {Buffer} privateKey - The private key to use
     * @param {Network} network - The network to use
     * @returns {ECPairInterface} - The generated keypair
     */
    public static fromPrivateKey(
        privateKey: Buffer,
        network: Network = networks.bitcoin,
    ): ECPairInterface {
        return this.ECPair.fromPrivateKey(privateKey, { network });
    }

    /**
     * Generate a keypair from a public key
     * @param {Buffer} publicKey - The public key to use
     * @param {Network} network - The network to use
     * @returns {ECPairInterface} - The generated keypair
     */
    public static fromPublicKey(
        publicKey: Buffer,
        network: Network = networks.bitcoin,
    ): ECPairInterface {
        return this.ECPair.fromPublicKey(publicKey, { network });
    }

    /**
     * Generate a multi-sig address
     * @param {Buffer[]} pubKeys - The public keys to use
     * @param {number} minimumSignatureRequired - The minimum number of signatures required
     * @param {Network} network - The network to use
     * @returns {Address} - The generated address
     * @throws {Error} - If the address cannot be generated
     */
    public static generateMultiSigAddress(
        pubKeys: Buffer[],
        minimumSignatureRequired: number,
        network: Network = networks.bitcoin,
    ): Address {
        const publicKeys: Buffer[] = this.verifyPubKeys(pubKeys, network);
        if (publicKeys.length !== pubKeys.length) throw new Error(`Contains invalid public keys`);

        const p2ms = payments.p2ms({
            m: minimumSignatureRequired,
            pubkeys: publicKeys,
            network: network,
        });

        const p2wsh = payments.p2wsh({ redeem: p2ms, network: network });
        const address = p2wsh.address;

        // fake params
        /*const multiSignParams: MultiSignParameters = {
            network: network,
            utxos: [],
            pubkeys: pubKeys,
            minimumSignatures: minimumSignatureRequired,
            feeRate: 100,
            receiver: 'a',
            requestedAmount: 1n,
            refundVault: 'a',
        };

        const address = new MultiSignTransaction(multiSignParams).getScriptAddress();
        */
        if (!address) {
            throw new Error('Failed to generate address');
        }

        return address;
    }

    /**
     * Verify public keys and return the public keys
     * @param {Buffer[]} pubKeys - The public keys to verify
     * @param {Network} network - The network to use
     * @returns {Buffer[]} - The verified public keys
     * @throws {Error} - If the key cannot be regenerated
     */
    public static verifyPubKeys(pubKeys: Buffer[], network: Network = networks.bitcoin): Buffer[] {
        return pubKeys.map((pubKey) => {
            const key = EcKeyPair.fromPublicKey(pubKey, network);

            if (!key) {
                throw new Error('Failed to regenerate key');
            }

            return key.publicKey;
        });
    }

    /**
     * Get a P2WPKH address from a keypair
     * @param {ECPairInterface} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {Address} - The address
     */
    public static getP2WPKHAddress(
        keyPair: ECPairInterface,
        network: Network = networks.bitcoin,
    ): Address {
        const res = payments.p2wpkh({ pubkey: keyPair.publicKey, network: network });

        if (!res.address) {
            throw new Error('Failed to generate wallet');
        }

        return res.address;
    }

    /**
     * Generate a random wallet
     * @param {Network} network - The network to use
     * @returns {IWallet} - The generated wallet
     */
    public static generateWallet(network: Network = networks.bitcoin): IWallet {
        const keyPair = this.ECPair.makeRandom({
            network: network,
        });

        const wallet = this.getP2WPKHAddress(keyPair, network);

        if (!wallet) {
            throw new Error('Failed to generate wallet');
        }

        return {
            address: wallet,
            privateKey: keyPair.toWIF(),
            publicKey: keyPair.publicKey.toString('hex'),
        };
    }

    /**
     * Verify that a contract address is a valid p2tr address
     * @param {Address} contractAddress - The contract address to verify
     * @param {Network} network - The network to use
     * @returns {boolean} - Whether the address is valid
     */
    public static verifyContractAddress(
        contractAddress: Address,
        network: Network = networks.bitcoin,
    ): boolean {
        return !!address.toOutputScript(contractAddress, network);
    }

    /**
     * Get the legacy address from a keypair
     * @param {ECPairInterface} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {Address} - The legacy address
     */
    public static getLegacyAddress(
        keyPair: ECPairInterface,
        network: Network = networks.bitcoin,
    ): Address {
        const wallet = payments.p2pkh({ pubkey: keyPair.publicKey, network: network });

        if (!wallet.address) {
            throw new Error('Failed to generate wallet');
        }

        return wallet.address;
    }

    /**
     * Generate a random keypair
     * @param {Network} network - The network to use
     * @returns {ECPairInterface} - The generated keypair
     */
    public static generateRandomKeyPair(network: Network = networks.bitcoin): ECPairInterface {
        return this.ECPair.makeRandom({
            network: network,
        });
    }

    /**
     * Generate a BIP32 keypair from a seed
     * @param {Buffer} seed - The seed to generate the keypair from
     * @param {Network} network - The network to use
     * @returns {BIP32Interface} - The generated keypair
     */
    public static fromSeed(seed: Buffer, network: Network = networks.bitcoin): BIP32Interface {
        return this.BIP32.fromSeed(seed, network);
    }

    /**
     * Get taproot address from keypair
     * @param {ECPairInterface} keyPair - The keypair to get the taproot address for
     * @param {Network} network - The network to use
     * @returns {Address} - The taproot address
     */
    public static getTaprootAddress(
        keyPair: ECPairInterface,
        network: Network = networks.bitcoin,
    ): Address {
        const { address } = payments.p2tr({
            internalPubkey: toXOnly(keyPair.publicKey),
            network: network,
        });

        if (!address) {
            throw new Error(`Failed to generate sender address for transaction`);
        }

        return address;
    }

    /**
     * Get taproot address from address
     * @param {Address} inAddr - The address to convert to taproot
     * @param {Network} network - The network to use
     * @returns {Address} - The taproot address
     */
    public static getTaprootAddressFromAddress(
        inAddr: Address,
        network: Network = networks.bitcoin,
    ): Address {
        const { address } = payments.p2tr({
            address: inAddr,
            network: network,
        });

        if (!address) {
            throw new Error(`Failed to generate sender address for transaction`);
        }

        return address;
    }

    /**
     * Get a keypair from a given seed.
     * @param {Buffer} seed - The seed to generate the key pair from
     * @param {Network} network - The network to use
     * @returns {ECPairInterface} - The generated key pair
     */
    public static fromSeedKeyPair(
        seed: Buffer,
        network: Network = networks.bitcoin,
    ): ECPairInterface {
        const fromSeed = this.BIP32.fromSeed(seed, network);
        const privKey = fromSeed.privateKey;
        if (!privKey) throw new Error('Failed to generate key pair');

        return this.ECPair.fromPrivateKey(privKey, { network });
    }
}
