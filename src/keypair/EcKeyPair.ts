import { backend, eccLib } from '../ecc/backend.js';
import bip32, {
    BIP32API,
    BIP32Factory,
    BIP32Interface,
    MLDSAKeyPair,
    MLDSASecurityLevel,
    QuantumBIP32Factory,
} from '@btc-vision/bip32';
import bitcoin, {
    address,
    concat,
    fromHex,
    fromOutputScript,
    initEccLib,
    Network,
    networks,
    opcodes,
    payments,
    PrivateKey,
    PublicKey,
    script,
    Signer,
    toHex,
    toXOnly,
    XOnlyPublicKey,
} from '@btc-vision/bitcoin';
import { ECPairSigner, type UniversalSigner } from '@btc-vision/ecpair';
import { IWallet } from './interfaces/IWallet.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { mod } from '@noble/curves/abstract/modular.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToNumberBE, concatBytes, randomBytes } from '@noble/curves/utils.js';

initEccLib(eccLib);

const BIP32factory = typeof bip32 === 'function' ? bip32 : BIP32Factory;
if (!BIP32factory) {
    throw new Error('Failed to load BIP32 library');
}

const Point = secp256k1.Point;
const CURVE_N = Point.Fn.ORDER;

const TAP_TAG = new Uint8Array([84, 97, 112, 84, 119, 101, 97, 107]); // 'TapTweak' in UTF-8
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
    public static BIP32: BIP32API = BIP32factory(backend);
    public static ECPairSigner = ECPairSigner;

    // Initialize precomputation for better performance
    static {
        // Precompute tables for the base point for better performance
        Point.BASE.precompute(8);
    }

    /**
     * Generate a keypair from a WIF
     * @param {string} wif - The WIF to use
     * @param {Network} network - The network to use
     * @returns {UniversalSigner} - The generated keypair
     */
    public static fromWIF(wif: string, network: Network = networks.bitcoin): UniversalSigner {
        return ECPairSigner.fromWIF(backend, wif, network);
    }

    /**
     * Generate a keypair from a private key
     * @param {Uint8Array} privateKey - The private key to use
     * @param {Network} network - The network to use
     * @returns {UniversalSigner} - The generated keypair
     */
    public static fromPrivateKey(
        privateKey: Uint8Array | PrivateKey,
        network: Network = networks.bitcoin,
    ): UniversalSigner {
        return ECPairSigner.fromPrivateKey(backend, privateKey as PrivateKey, network);
    }

    /**
     * Generate a keypair from a public key
     * @param {Uint8Array} publicKey - The public key to use
     * @param {Network} network - The network to use
     * @returns {UniversalSigner} - The generated keypair
     */
    public static fromPublicKey(
        publicKey: Uint8Array | PublicKey,
        network: Network = networks.bitcoin,
    ): UniversalSigner {
        return ECPairSigner.fromPublicKey(backend, publicKey as PublicKey, network);
    }

    /**
     * Generate a multi-sig address
     * @param {Uint8Array[]} pubKeys - The public keys to use
     * @param {number} minimumSignatureRequired - The minimum number of signatures required
     * @param {Network} network - The network to use
     * @returns {string} - The generated address
     * @throws {Error} - If the address cannot be generated
     */
    public static generateMultiSigAddress(
        pubKeys: Uint8Array[] | PublicKey[],
        minimumSignatureRequired: number,
        network: Network = networks.bitcoin,
    ): string {
        const publicKeys: Uint8Array[] = this.verifyPubKeys(pubKeys, network);
        if (publicKeys.length !== pubKeys.length) throw new Error(`Contains invalid public keys`);

        const p2ms = payments.p2ms({
            m: minimumSignatureRequired,
            pubkeys: publicKeys as PublicKey[],
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
     * @param {Uint8Array[]} pubKeys - The public keys to verify
     * @param {Network} network - The network to use
     * @returns {Uint8Array[]} - The verified public keys
     * @throws {Error} - If the key cannot be regenerated
     */
    public static verifyPubKeys(
        pubKeys: Uint8Array[],
        network: Network = networks.bitcoin,
    ): Uint8Array[] {
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
     * @param {UniversalSigner} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {string} - The address
     */
    public static getP2WPKHAddress(
        keyPair: UniversalSigner | Signer,
        network: Network = networks.bitcoin,
    ): string {
        const res = payments.p2wpkh({ pubkey: keyPair.publicKey, network: network });

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

        // Convert the tweaked public key hex string to a Uint8Array
        let tweakedPubKeyBuffer: XOnlyPublicKey = fromHex(tweakedPubKeyHex) as XOnlyPublicKey;
        if (tweakedPubKeyBuffer.length !== 32) {
            tweakedPubKeyBuffer = toXOnly(tweakedPubKeyBuffer);
        }

        return EcKeyPair.tweakedPubKeyBufferToAddress(tweakedPubKeyBuffer, network);
    }

    /**
     * Get the address of a tweaked public key
     * @param {Uint8Array} tweakedPubKeyBuffer - The tweaked public key buffer
     * @param {Network} network - The network to use
     * @returns {string} - The address
     * @throws {Error} - If the address cannot be generated
     */
    public static tweakedPubKeyBufferToAddress(
        tweakedPubKeyBuffer: XOnlyPublicKey,
        network: Network,
    ): string {
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
     * Generate a P2OP address
     * @param bytes - The bytes to use for the P2OP address
     * @param network - The network to use
     * @param deploymentVersion - The deployment version (default is 0)
     * @returns {string} - The generated P2OP address
     */
    public static p2op(
        bytes: Uint8Array,
        network: Network = networks.bitcoin,
        deploymentVersion: number = 0,
    ): string {
        // custom opnet contract addresses
        const witnessProgram = concat([
            new Uint8Array([deploymentVersion]),
            bitcoin.crypto.hash160(bytes),
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

        // Convert the tweaked public key hex string to a Uint8Array
        const tweakedPubKeyBuffer = fromHex(tweakedPubKeyHex) as XOnlyPublicKey;
        if (tweakedPubKeyBuffer.length !== 32) {
            throw new Error('Invalid xOnly public key length');
        }

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
     * @param {Uint8Array | string} pub - The public key to tweak
     * @returns {Uint8Array} - The tweaked public key
     * @throws {Error} - If the public key cannot be tweaked
     */
    public static tweakPublicKey(pub: Uint8Array | string): Uint8Array {
        if (typeof pub === 'string' && pub.startsWith('0x')) pub = pub.slice(2);

        const hexStr = typeof pub === 'string' ? pub : toHex(pub);
        const P = Point.fromHex(hexStr);
        const Peven = (P.y & 1n) === 0n ? P : P.negate();

        const xBytes = Peven.toBytes(true).subarray(1);
        const tBytes = tapTweakHash(xBytes);
        const t = mod(bytesToNumberBE(tBytes), CURVE_N);

        const Q = Peven.add(Point.BASE.multiply(t));
        return Q.toBytes(true);
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
            const P = Point.fromHex(toHex(bytes));
            const P_even = P.y % 2n === 0n ? P : P.negate();
            const Q = P_even.add(T);
            return Q.toBytes(true);
        });
    }

    /**
     * Generate a random wallet with both classical and quantum keys
     *
     * @param network - The network to use
     * @param securityLevel - The ML-DSA security level for quantum keys (default: LEVEL2/44)
     * @returns An object containing both classical and quantum key information
     */
    public static generateWallet(
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
    ): IWallet {
        const keyPair = ECPairSigner.makeRandom(backend, network, {
            rng: (size: number): Uint8Array => {
                return randomBytes(size);
            },
        });

        const wallet = this.getP2WPKHAddress(keyPair, network);

        if (!wallet) {
            throw new Error('Failed to generate wallet');
        }

        // Generate random quantum keypair with network
        const quantumKeyPair = this.generateQuantumKeyPair(securityLevel, network);

        return {
            address: wallet,
            privateKey: keyPair.toWIF(),
            publicKey: toHex(keyPair.publicKey),
            quantumPrivateKey: toHex(quantumKeyPair.privateKey),
            quantumPublicKey: toHex(quantumKeyPair.publicKey),
        };
    }

    /**
     * Generate a random quantum ML-DSA keypair
     *
     * This creates a standalone quantum-resistant keypair without using BIP32 derivation.
     * The keys are generated using cryptographically secure random bytes.
     *
     * @param securityLevel - The ML-DSA security level (default: LEVEL2/44)
     * @param network - The Bitcoin network (default: bitcoin mainnet)
     * @returns A random ML-DSA keypair
     */
    public static generateQuantumKeyPair(
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
        network: Network = networks.bitcoin,
    ): MLDSAKeyPair {
        // Generate random seed for quantum key generation
        const randomSeed = randomBytes(64);

        // Create a quantum root from the random seed with network parameter
        const quantumRoot = QuantumBIP32Factory.fromSeed(randomSeed, network, securityLevel);

        if (!quantumRoot.privateKey || !quantumRoot.publicKey) {
            throw new Error('Failed to generate quantum keypair');
        }

        return {
            privateKey: new Uint8Array(quantumRoot.privateKey),
            publicKey: new Uint8Array(quantumRoot.publicKey),
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
     * @param {UniversalSigner} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {string} - The legacy address
     */
    public static getLegacySegwitAddress(
        keyPair: UniversalSigner,
        network: Network = networks.bitcoin,
    ): string {
        const wallet = payments.p2sh({
            redeem: payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }),
            network: network,
        });

        if (!wallet.address) {
            throw new Error('Failed to generate wallet');
        }

        return wallet.address;
    }

    /**
     * Get the legacy address from a keypair
     * @param {UniversalSigner} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {string} - The legacy address
     */
    public static getLegacyAddress(
        keyPair: UniversalSigner,
        network: Network = networks.bitcoin,
    ): string {
        const wallet = payments.p2pkh({ pubkey: keyPair.publicKey, network: network });
        if (!wallet.address) {
            throw new Error('Failed to generate wallet');
        }

        return wallet.address;
    }

    /**
     * Get the legacy address from a public key
     * @param publicKey
     * @param {Network} network - The network to use
     * @returns {string} - The legacy address
     */
    public static getP2PKH(publicKey: PublicKey, network: Network = networks.bitcoin): string {
        const wallet = payments.p2pkh({ pubkey: publicKey, network: network });
        if (!wallet.address) {
            throw new Error('Failed to generate wallet');
        }

        return wallet.address;
    }

    /**
     * Get the P2PK output from a keypair
     * @param {UniversalSigner} keyPair - The keypair to get the address for
     * @param {Network} network - The network to use
     * @returns {string} - The legacy address
     */
    public static getP2PKAddress(
        keyPair: UniversalSigner,
        network: Network = networks.bitcoin,
    ): string {
        const wallet = payments.p2pk({ pubkey: keyPair.publicKey, network: network });
        if (!wallet.output) {
            throw new Error('Failed to generate wallet');
        }

        return '0x' + toHex(wallet.output);
    }

    /**
     * Generate a random keypair
     * @param {Network} network - The network to use
     * @returns {UniversalSigner} - The generated keypair
     */
    public static generateRandomKeyPair(network: Network = networks.bitcoin): UniversalSigner {
        return ECPairSigner.makeRandom(backend, network, {
            rng: (size: number): Uint8Array => {
                return randomBytes(size);
            },
        });
    }

    /**
     * Generate a BIP32 keypair from a seed
     * @param {Uint8Array} seed - The seed to generate the keypair from
     * @param {Network} network - The network to use
     * @returns {BIP32Interface} - The generated keypair
     */
    public static fromSeed(seed: Uint8Array, network: Network = networks.bitcoin): BIP32Interface {
        return this.BIP32.fromSeed(seed, network);
    }

    /**
     * Get taproot address from keypair
     * @param {UniversalSigner | Signer} keyPair - The keypair to get the taproot address for
     * @param {Network} network - The network to use
     * @returns {string} - The taproot address
     */
    public static getTaprootAddress(
        keyPair: UniversalSigner | Signer,
        network: Network = networks.bitcoin,
    ): string {
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
     * @param {Uint8Array} seed - The seed to generate the key pair from
     * @param {Network} network - The network to use
     * @returns {UniversalSigner} - The generated key pair
     */
    public static fromSeedKeyPair(
        seed: Uint8Array,
        network: Network = networks.bitcoin,
    ): UniversalSigner {
        const fromSeed = this.BIP32.fromSeed(seed, network);
        const privKey = fromSeed.privateKey;
        if (!privKey) throw new Error('Failed to generate key pair');

        return ECPairSigner.fromPrivateKey(backend, privKey, network);
    }
}
