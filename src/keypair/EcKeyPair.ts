import * as ecc from '@bitcoinerlab/secp256k1';
import bip32, { BIP32API, BIP32Factory, BIP32Interface } from 'bip32';
import bitcoin, {
    address,
    fromOutputScript,
    initEccLib,
    Network,
    networks,
    opcodes,
    payments,
    script,
    Signer,
    toXOnly,
} from '@btc-vision/bitcoin';
import { ECPairAPI, ECPairFactory, ECPairInterface } from 'ecpair';
import { IWallet } from './interfaces/IWallet.js';
import { secp256k1 } from '@noble/curves/secp256k1';
import { mod } from '@noble/curves/abstract/modular';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToNumberBE, concatBytes, utf8ToBytes } from '@noble/curves/utils.js';

initEccLib(ecc);

const BIP32factory = typeof bip32 === 'function' ? bip32 : BIP32Factory;
if (!BIP32factory) {
    throw new Error('Failed to load BIP32 library');
}

const Point = secp256k1.Point;
const CURVE_N = Point.Fn.ORDER;

const TAP_TAG = utf8ToBytes('TapTweak');
const TAP_TAG_HASH = sha256(TAP_TAG);

function tapTweakHash(x: Uint8Array): Uint8Array {
    return sha256(concatBytes(TAP_TAG_HASH, TAP_TAG_HASH, x));
}

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

    // Initialize precomputation for better performance
    static {
        // Precompute tables for the base point for better performance
        Point.BASE.precompute(8);
    }

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
        keyPair: ECPairInterface | Signer,
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
     * Generate a P2OP address
     * @param bytes - The bytes to use for the P2OP address
     * @param network - The network to use
     * @param deploymentVersion - The deployment version (default is 0)
     * @returns {string} - The generated P2OP address
     */
    public static p2op(
        bytes: Buffer | Uint8Array,
        network: Network = networks.bitcoin,
        deploymentVersion: number = 0,
    ): string {
        // custom opnet contract addresses
        const witnessProgram = Buffer.concat([
            Buffer.from([deploymentVersion]),
            bitcoin.crypto.hash160(Buffer.from(bytes)),
        ]);

        if (witnessProgram.length < 2 || witnessProgram.length > 40) {
            throw new Error('Witness program must be 2-40 bytes.');
        }

        const scriptData = script.compile([opcodes.OP_16, witnessProgram]);
        return fromOutputScript(scriptData, network);
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
     * @param {Buffer | Uint8Array | string} pub - The public key to tweak
     * @returns {Buffer} - The tweaked public key hex string
     * @throws {Error} - If the public key cannot be tweaked
     */
    public static tweakPublicKey(pub: Uint8Array | Buffer | string): Buffer {
        if (typeof pub === 'string' && pub.startsWith('0x')) pub = pub.slice(2);

        const P = Point.fromHex(pub);
        const Peven = (P.y & 1n) === 0n ? P : P.negate();

        const xBytes = Peven.toBytes(true).subarray(1);
        const tBytes = tapTweakHash(xBytes);
        const t = mod(bytesToNumberBE(tBytes), CURVE_N);

        const Q = Peven.add(Point.BASE.multiply(t));
        return Buffer.from(Q.toBytes(true));
    }

    /**
     * Tweak a batch of public keys
     * @param {readonly Uint8Array[]} pubkeys - The public keys to tweak
     * @param {bigint} tweakScalar - The scalar to use for tweaking
     * @returns {Uint8Array[]} - The tweaked public keys
     */
    public static tweakBatchSharedT(
        pubkeys: readonly Uint8Array[],
        tweakScalar: bigint,
    ): Uint8Array[] {
        const T = Point.BASE.multiply(tweakScalar);

        return pubkeys.map((bytes) => {
            const P = Point.fromHex(bytes);
            const P_even = P.y % 2n === 0n ? P : P.negate();
            const Q = P_even.add(T);
            return Q.toBytes(true);
        });
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
     * @param publicKey
     * @param {Network} network - The network to use
     * @returns {string} - The legacy address
     */
    public static getP2PKH(
        publicKey: Buffer | Uint8Array,
        network: Network = networks.bitcoin,
    ): string {
        const wallet = payments.p2pkh({ pubkey: Buffer.from(publicKey), network: network });
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
