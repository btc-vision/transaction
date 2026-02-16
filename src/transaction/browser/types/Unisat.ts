import type { Web3Provider } from '../Web3Provider.js';
import { UnisatChainType, WalletNetworks } from '../WalletNetworks.js';

export interface UnisatChainInfo {
    readonly enum: UnisatChainType;
    readonly name: string;
    readonly network: WalletNetworks;
}

export interface Balance {
    readonly confirmed: number;
    readonly unconfirmed: number;
    readonly total: number;

    readonly csv1_unlocked?: number;
    readonly csv1_locked?: number;
    readonly p2wda_total_amount?: number;
}

export enum MessageType {
    ecdsa = 'ecdsa',
    bip322 = 'bip322-simple',
}

export enum SignatureType {
    ecdsa = 'ecdsa',
    schnorr = 'schnorr',
}

interface ToSignInputBase {
    readonly index: number;
    readonly sighashTypes?: number[];
    readonly disableTweakSigner?: boolean;
}

export interface ToSignInputPublicKey extends ToSignInputBase {
    readonly publicKey: string;
}

export interface ToSignInputAddress extends ToSignInputBase {
    readonly address: string;
}

export type ToSignInput = ToSignInputPublicKey | ToSignInputAddress;

export interface PsbtSignatureOptions {
    readonly autoFinalized?: boolean;
    readonly toSignInputs?: ToSignInput[];
}

export interface Unisat {
    web3?: Web3Provider;

    disconnect: () => Promise<void>;
    connect: () => Promise<void>;

    sendBitcoin(
        toAddress: string,
        satoshis: number,
        options: { feeRate: number; memo?: string; memos?: string[] },
    ): Promise<string>;

    requestAccounts(): Promise<string[]>;

    getNetwork(): Promise<WalletNetworks>;

    getChain(): Promise<UnisatChainInfo>;

    getAccounts(): Promise<string[]>;

    switchNetwork(network: WalletNetworks): Promise<void>;

    getPublicKey(): Promise<string>;

    getBalance(): Promise<Balance>;

    signMessage(message: string | Uint8Array, type?: MessageType): Promise<string>;

    signData(hex: string, type?: SignatureType): Promise<string>;

    pushTx(options: { rawtx: string }): Promise<string>;

    signPsbt(psbtHex: string, psbtOptions: PsbtSignatureOptions): Promise<string>;

    signPsbts(psbtHex: string[], psbtOptions: PsbtSignatureOptions[]): Promise<string[]>;

    pushPsbt(psbtHex: string): Promise<string>;

    on(event: 'accountsChanged', listener: (accounts: string[]) => void): void;

    on(event: 'chainChanged' | 'networkChanged', listener: (chain: UnisatChainInfo) => void): void;

    on(event: 'disconnect', listener: () => void): void;

    removeListener(event: 'accountsChanged', listener: (accounts: string[]) => void): void;

    removeListener(
        event: 'chainChanged' | 'networkChanged',
        listener: (chain: UnisatChainInfo) => void,
    ): void;

    removeListener(event: 'disconnect', listener: () => void): void;
}
