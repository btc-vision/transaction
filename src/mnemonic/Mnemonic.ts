import * as bip39 from 'bip39';
import {
    BIP32Factory,
    type BIP32Interface,
    MLDSASecurityLevel,
    QuantumBIP32Factory,
    type QuantumBIP32Interface,
} from '@btc-vision/bip32';
import { type Network, networks, toHex } from '@btc-vision/bitcoin';
import { backend } from '../ecc/backend.js';
import { Wallet } from '../keypair/Wallet.js';
import { MnemonicStrength } from './MnemonicStrength.js';
import { BIPStandard, buildBIPPath } from './BIPStandard.js';
import { AddressTypes } from '../keypair/AddressVerificator.js';

const bip32 = BIP32Factory(backend);

export { BIPStandard, getBIPDescription } from './BIPStandard.js';

/**
 * Mnemonic class for managing BIP39 mnemonic phrases with BIP360 quantum support
 */
export class Mnemonic implements Disposable {
    private readonly _phrase: string;
    private readonly _passphrase: string;
    private readonly _network: Network;
    private readonly _securityLevel: MLDSASecurityLevel;
    private readonly _seed: Uint8Array;
    private readonly _classicalRoot: BIP32Interface;
    private readonly _quantumRoot: QuantumBIP32Interface;

    constructor(
        phrase: string,
        passphrase: string = '',
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
    ) {
        if (!bip39.validateMnemonic(phrase)) {
            throw new Error('Invalid mnemonic phrase');
        }

        this._phrase = phrase;
        this._passphrase = passphrase;
        this._network = network;
        this._securityLevel = securityLevel;

        // Derive the seed from the mnemonic
        this._seed = bip39.mnemonicToSeedSync(this._phrase, this._passphrase);

        // Create the classical BIP32 root
        this._classicalRoot = bip32.fromSeed(this._seed, this._network);

        // Create the quantum BIP32 root with network parameter
        this._quantumRoot = QuantumBIP32Factory.fromSeed(
            this._seed,
            this._network,
            this._securityLevel,
        );
    }

    public get phrase(): string {
        return this._phrase;
    }

    public get network(): Network {
        return this._network;
    }

    public get securityLevel(): MLDSASecurityLevel {
        return this._securityLevel;
    }

    public get seed(): Uint8Array {
        return new Uint8Array(this._seed);
    }

    public static generatePhrase(strength: MnemonicStrength = MnemonicStrength.MAXIMUM): string {
        return bip39.generateMnemonic(strength);
    }

    public static generate(
        strength: MnemonicStrength = MnemonicStrength.MAXIMUM,
        passphrase: string = '',
        network: Network = networks.bitcoin,
        securityLevel: MLDSASecurityLevel = MLDSASecurityLevel.LEVEL2,
    ): Mnemonic {
        const phrase = bip39.generateMnemonic(strength);
        return new Mnemonic(phrase, passphrase, network, securityLevel);
    }

    public static validate(phrase: string): boolean {
        return bip39.validateMnemonic(phrase);
    }

    /**
     * Best-effort zeroing of secret material held by this mnemonic.
     *
     * Zeros the seed buffer and root private keys in-place.
     * The mnemonic phrase and passphrase are JS strings and cannot be zeroed.
     */
    public zeroize(): void {
        this._seed.fill(0);
        this._classicalRoot.privateKey?.fill(0);
        this._quantumRoot.privateKey?.fill(0);
    }

    public [Symbol.dispose](): void {
        this.zeroize();
    }

    public derive(
        index: number = 0,
        account: number = 0,
        isChange: boolean = false,
        bipStandard: BIPStandard = BIPStandard.BIP84,
    ): Wallet {
        const classicalPath = this.buildClassicalPath(account, index, isChange, bipStandard);
        const classicalChild = this._classicalRoot.derivePath(classicalPath);

        if (!classicalChild.privateKey) {
            throw new Error(`Failed to derive classical private key at index ${index}`);
        }

        const quantumPath = this.buildQuantumPath(account, index, isChange);
        const quantumChild = this._quantumRoot.derivePath(quantumPath);

        if (!quantumChild.privateKey) {
            throw new Error(`Failed to derive quantum private key at index ${index}`);
        }

        return new Wallet(
            toHex(new Uint8Array(classicalChild.privateKey)),
            toHex(new Uint8Array(quantumChild.privateKey)),
            this._network,
            this._securityLevel,
            new Uint8Array(this._quantumRoot.chainCode),
        );
    }

    public deriveOPWallet(
        addressType: AddressTypes = AddressTypes.P2TR,
        index: number = 0,
        account: number = 0,
        isChange: boolean = false,
    ): Wallet {
        let purpose: number;
        switch (addressType) {
            case AddressTypes.P2PKH:
                purpose = 44;
                break;
            case AddressTypes.P2SH_OR_P2SH_P2WPKH:
                purpose = 49;
                break;
            case AddressTypes.P2WPKH:
                purpose = 84;
                break;
            case AddressTypes.P2TR:
                purpose = 86;
                break;
            default:
                throw new Error(`Unsupported address type: ${addressType}`);
        }

        const coinType = this.getCoinType();
        const change = isChange ? 1 : 0;
        const classicalPath = `m/${purpose}'/0'/${account}'/${change}/${index}`;

        const classicalChild = this._classicalRoot.derivePath(classicalPath);

        if (!classicalChild.privateKey) {
            throw new Error(`Failed to derive classical private key at path ${classicalPath}`);
        }

        const quantumPath = `m/360'/${coinType}'/${account}'/${change}/${index}`;
        const quantumChild = this._quantumRoot.derivePath(quantumPath);

        if (!quantumChild.privateKey) {
            throw new Error(`Failed to derive quantum private key at path ${quantumPath}`);
        }

        return new Wallet(
            toHex(new Uint8Array(classicalChild.privateKey)),
            toHex(new Uint8Array(quantumChild.privateKey)),
            this._network,
            this._securityLevel,
            new Uint8Array(this._quantumRoot.chainCode),
        );
    }

    public deriveMultipleUnisat(
        addressType: AddressTypes = AddressTypes.P2TR,
        count: number = 5,
        startIndex: number = 0,
        account: number = 0,
        isChange: boolean = false,
    ): Wallet[] {
        const wallets: Wallet[] = [];

        for (let i = 0; i < count; i++) {
            wallets.push(this.deriveOPWallet(addressType, startIndex + i, account, isChange));
        }

        return wallets;
    }

    public deriveMultiple(
        count: number,
        startIndex: number = 0,
        account: number = 0,
        isChange: boolean = false,
        bipStandard: BIPStandard = BIPStandard.BIP84,
    ): Wallet[] {
        const wallets: Wallet[] = [];

        for (let i = 0; i < count; i++) {
            wallets.push(this.derive(startIndex + i, account, isChange, bipStandard));
        }

        return wallets;
    }

    public deriveCustomPath(classicalPath: string, quantumPath: string): Wallet {
        const classicalChild = this._classicalRoot.derivePath(classicalPath);
        const quantumChild = this._quantumRoot.derivePath(quantumPath);

        if (!classicalChild.privateKey) {
            throw new Error(`Failed to derive classical private key at path ${classicalPath}`);
        }

        if (!quantumChild.privateKey) {
            throw new Error(`Failed to derive quantum private key at path ${quantumPath}`);
        }

        return new Wallet(
            toHex(new Uint8Array(classicalChild.privateKey)),
            toHex(new Uint8Array(quantumChild.privateKey)),
            this._network,
            this._securityLevel,
            new Uint8Array(this._quantumRoot.chainCode),
        );
    }

    public getClassicalRoot(): BIP32Interface {
        return this._classicalRoot;
    }

    public getQuantumRoot(): QuantumBIP32Interface {
        return this._quantumRoot;
    }

    private buildClassicalPath(
        account: number,
        index: number,
        isChange: boolean,
        bipStandard: BIPStandard = BIPStandard.BIP84,
    ): string {
        const coinType = this.getCoinType();
        const change = isChange ? 1 : 0;
        return buildBIPPath(bipStandard, coinType, account, change, index);
    }

    private buildQuantumPath(account: number, index: number, isChange: boolean): string {
        const coinType = this.getCoinType();
        const change = isChange ? 1 : 0;
        return `m/360'/${coinType}'/${account}'/${change}/${index}`;
    }

    private getCoinType(): number {
        if (
            this._network.bech32 === networks.testnet.bech32 ||
            this._network.bech32 === networks.opnetTestnet.bech32 ||
            this._network.bech32 === networks.regtest.bech32
        ) {
            return 1;
        }
        return 0;
    }
}
