import * as ecc from '@bitcoinerlab/secp256k1';
import bip32, { BIP32API, BIP32Factory, BIP32Interface } from 'bip32';
import {
    address,
    initEccLib,
    Network,
    networks,
    payments,
    Signer,
    taggedHash,
    toXOnly,
} from '@btc-vision/bitcoin';
import { ECPairAPI, ECPairFactory, ECPairInterface } from 'ecpair';
import { IWallet } from './interfaces/IWallet.js';
import { CURVE, ProjectivePoint as Point } from '@noble/secp256k1';

initEccLib(ecc);

const BIP32factory = typeof bip32 === 'function' ? bip32 : BIP32Factory;
if (!BIP32factory) {
    throw new Error('Failed to load BIP32 library');
}

const mod = (a: bigint, b: bigint): bigint => {
    const result = a % b;
    return result >= 0n ? result : result + b;
};

/**
 * Class for handling EC key pairs
 * @class EcKeyPair
 * @module EcKeyPair
 * @typicalname EcKeyPair
 * @example import { EcKeyPair } from '@btc-vision/transaction';
 */
export class EcKeyPair {
    public static BIP32: BIP32API = BIP32factory(ecc);
    public static ECPair: ECPairAPI = ECPairFactory(ecc);

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
        privateKey: Buffer | Uint8Array,
        network: Network = networks.bitcoin,
    ): ECPairInterface {
        return this.ECPair.fromPrivateKey(
            !Buffer.isBuffer(privateKey) ? Buffer.from(privateKey) : privateKey,
            { network },
        );
    }

    /**
     * Generate a keypair from a public key
     * @param {Buffer | Uint8Array} publicKey - The public key to use
     * @param {Network} network - The network to use
     * @returns {ECPairInterface} - The generated keypair
     */
    public static fromPublicKey(
        publicKey: Buffer | Uint8Array,
        network: Network = networks.bitcoin,
    ): ECPairInterface {
        const buf = !Buffer.isBuffer(publicKey) ? Buffer.from(publicKey) : publicKey;

        return this.ECPair.fromPublicKey(buf, { network });
    }

    /**
     * Generate a multi-sig address
     * @param {Buffer[]} pubKeys - The public keys to use
     * @param {number} minimumSignatureRequired - The minimum number of signatures required
     * @param {Network} network - The network to use
     * @returns {string} - The generated address
     * @throws {Error} - If the address cannot be generated
     */
    public static generateMultiSigAddress(
        pubKeys: Buffer[],
        minimumSignatureRequired: number,
        network: Network = networks.bitcoin,
    ): string {
        const publicKeys: Buffer[] = this.verifyPubKeys(pubKeys, network);
        if (publicKeys.length !== pubKeys.length) throw new Error(`Contains invalid public keys`);

        const p2ms = payments.p2ms({
            m: minimumSignatureRequired,
            pubkeys: publicKeys,
            network: network,
        });

        const p2wsh = payments.p2wsh({ redeem: p2ms, network: network });
        const address = p2wsh.address;

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

            return Buffer.from(key.publicKey);
        });
    }

    /**
     * Get a P2WPKH address from a keypair
     * @param {ECPairInterface} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {string} - The address
     */
    public static getP2WPKHAddress(
        keyPair: ECPairInterface,
        network: Network = networks.bitcoin,
    ): string {
        const res = payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network: network });

        if (!res.address) {
            throw new Error('Failed to generate wallet');
        }

        return res.address;
    }

    /**
     * Get the address of a tweaked public key
     * @param {string} tweakedPubKeyHex - The tweaked public key hex string
     * @param {Network} network - The network to use
     * @returns {string} - The address
     * @throws {Error} - If the address cannot be generated
     */
    public static tweakedPubKeyToAddress(tweakedPubKeyHex: string, network: Network): string {
        if (tweakedPubKeyHex.startsWith('0x')) {
            tweakedPubKeyHex = tweakedPubKeyHex.slice(2);
        }

        // Convert the tweaked public key hex string to a Buffer
        let tweakedPubKeyBuffer: Buffer = Buffer.from(tweakedPubKeyHex, 'hex');
        if (tweakedPubKeyBuffer.length !== 32) {
            tweakedPubKeyBuffer = toXOnly(tweakedPubKeyBuffer);
        }

        return EcKeyPair.tweakedPubKeyBufferToAddress(tweakedPubKeyBuffer, network);
    }

    /**
     * Get the address of a tweaked public key
     * @param {Buffer | Uint8Array} tweakedPubKeyBuffer - The tweaked public key buffer
     * @param {Network} network - The network to use
     * @returns {string} - The address
     * @throws {Error} - If the address cannot be generated
     */
    public static tweakedPubKeyBufferToAddress(
        tweakedPubKeyBuffer: Buffer | Uint8Array,
        network: Network,
    ): string {
        // Generate the Taproot address using the p2tr payment method
        const { address } = payments.p2tr({
            pubkey: Buffer.isBuffer(tweakedPubKeyBuffer)
                ? tweakedPubKeyBuffer
                : Buffer.from(tweakedPubKeyBuffer),
            network: network,
        });

        if (!address) {
            throw new Error('Failed to generate Taproot address');
        }

        return address;
    }

    /**
     * Get the address of a xOnly tweaked public key
     * @param {string} tweakedPubKeyHex - The xOnly tweaked public key hex string
     * @param {Network} network - The network to use
     * @returns {string} - The address
     * @throws {Error} - If the address cannot be generated
     */
    public static xOnlyTweakedPubKeyToAddress(tweakedPubKeyHex: string, network: Network): string {
        if (tweakedPubKeyHex.startsWith('0x')) {
            tweakedPubKeyHex = tweakedPubKeyHex.slice(2);
        }

        // Convert the tweaked public key hex string to a Buffer
        const tweakedPubKeyBuffer = Buffer.from(tweakedPubKeyHex, 'hex');

        // Generate the Taproot address using the p2tr payment method
        const { address } = payments.p2tr({
            pubkey: tweakedPubKeyBuffer,
            network: network,
        });

        if (!address) {
            throw new Error('Failed to generate Taproot address');
        }

        return address;
    }

    /**
     * Tweak a public key
     * @param {string | Buffer} compressedPubKeyHex - The compressed public key hex string
     * @returns {Buffer} - The tweaked public key hex string
     * @throws {Error} - If the public key cannot be tweaked
     */
    public static tweakPublicKey(compressedPubKeyHex: string | Buffer): Buffer {
        if (typeof compressedPubKeyHex === 'string' && compressedPubKeyHex.startsWith('0x')) {
            compressedPubKeyHex = compressedPubKeyHex.slice(2);
        }

        if (typeof compressedPubKeyHex !== 'string') {
            compressedPubKeyHex = compressedPubKeyHex.toString('hex');
        }

        // Convert the compressed public key hex string to a Point on the curve
        let P = Point.fromHex(compressedPubKeyHex);

        // Ensure the point has an even y-coordinate
        if ((P.y & 1n) !== 0n) {
            // Negate the point to get an even y-coordinate
            P = P.negate();
        }

        // Get the x-coordinate (32 bytes) of the point
        const x = P.toRawBytes(true).slice(1); // Remove the prefix byte

        // Compute the tweak t = H_tapTweak(x)
        const tHash = taggedHash('TapTweak', Buffer.from(x));
        const t = mod(BigInt('0x' + Buffer.from(tHash).toString('hex')), CURVE.n);

        // Compute Q = P + t*G (where G is the generator point)
        const Q = P.add(Point.BASE.mul(t));

        // Return the tweaked public key in compressed form (hex string)
        return Buffer.from(Q.toRawBytes(true));
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
            publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
        };
    }

    /**
     * Verify that a contract address is a valid p2tr address
     * @param {string} contractAddress - The contract address to verify
     * @param {Network} network - The network to use
     * @returns {boolean} - Whether the address is valid
     */
    public static verifyContractAddress(
        contractAddress: string,
        network: Network = networks.bitcoin,
    ): boolean {
        return !!address.toOutputScript(contractAddress, network);
    }

    /**
     * Get the legacy segwit address from a keypair
     * @param {ECPairInterface} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {string} - The legacy address
     */
    public static getLegacySegwitAddress(
        keyPair: ECPairInterface,
        network: Network = networks.bitcoin,
    ): string {
        const wallet = payments.p2sh({
            redeem: payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network: network }),
            network: network,
        });

        if (!wallet.address) {
            throw new Error('Failed to generate wallet');
        }

        return wallet.address;
    }

    /**
     * Get the legacy address from a keypair
     * @param {ECPairInterface} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {string} - The legacy address
     */
    public static getLegacyAddress(
        keyPair: ECPairInterface,
        network: Network = networks.bitcoin,
    ): string {
        const wallet = payments.p2pkh({ pubkey: Buffer.from(keyPair.publicKey), network: network });
        if (!wallet.address) {
            throw new Error('Failed to generate wallet');
        }

        return wallet.address;
    }

    /**
     * Get the legacy address from a keypair
     * @param {ECPairInterface} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {string} - The legacy address
     */
    public static getP2PKAddress(
        keyPair: ECPairInterface,
        network: Network = networks.bitcoin,
    ): string {
        const wallet = payments.p2pk({ pubkey: Buffer.from(keyPair.publicKey), network: network });
        if (!wallet.output) {
            throw new Error('Failed to generate wallet');
        }

        return '0x' + wallet.output.toString('hex');
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
     * @returns {string} - The taproot address
     */
    public static getTaprootAddress(
        keyPair: ECPairInterface | Signer,
        network: Network = networks.bitcoin,
    ): string {
        const { address } = payments.p2tr({
            internalPubkey: toXOnly(Buffer.from(keyPair.publicKey)),
            network: network,
        });

        if (!address) {
            throw new Error(`Failed to generate sender address for transaction`);
        }

        return address;
    }

    /**
     * Get taproot address from address
     * @param {string} inAddr - The address to convert to taproot
     * @param {Network} network - The network to use
     * @returns {string} - The taproot address
     */
    public static getTaprootAddressFromAddress(
        inAddr: string,
        network: Network = networks.bitcoin,
    ): string {
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

        return this.ECPair.fromPrivateKey(Buffer.from(privKey), { network });
    }
}
