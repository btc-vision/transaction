import { Address } from '@btc-vision/bsi-binary';
import { Web3Provider } from '../Web3Provider.js';
export declare enum UnisatNetwork {
    testnet = "testnet",
    mainnet = "livenet",
    regtest = "regtest"
}
export declare enum UnisatChainType {
    BITCOIN_MAINNET = "BITCOIN_MAINNET",
    BITCOIN_TESTNET = "BITCOIN_TESTNET",
    FRACTAL_BITCOIN_MAINNET = "FRACTAL_BITCOIN_MAINNET",
    BITCOIN_REGTEST = "BITCOIN_REGTEST"
}
export interface UnisatChainInfo {
    readonly enum: UnisatChainType;
    readonly name: string;
    readonly network: UnisatNetwork;
}
export interface Balance {
    readonly confirmed: number;
    readonly unconfirmed: number;
    readonly total: number;
}
export declare enum MessageType {
    ecdsa = "ecdsa",
    bip322 = "bip322-simple"
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
    readonly address: Address;
}
export type ToSignInput = ToSignInputPublicKey | ToSignInputAddress;
export interface PsbtSignatureOptions {
    readonly autoFinalized?: boolean;
    readonly toSignInputs?: ToSignInput[];
}
export interface Unisat {
    web3?: Web3Provider;
    sendBitcoin(toAddress: Address, satoshis: number, options: {
        feeRate: number;
        memo?: string;
        memos?: string[];
    }): Promise<string>;
    requestAccounts(): Promise<string[]>;
    getNetwork(): Promise<UnisatNetwork>;
    getAccounts(): Promise<string[]>;
    switchNetwork(network: UnisatNetwork): Promise<void>;
    getPublicKey(): Promise<string>;
    getBalance(): Promise<Balance>;
    signMessage(message: string, type?: MessageType): Promise<string>;
    pushTx(options: {
        rawtx: string;
    }): Promise<string>;
    signPsbt(psbtHex: string, psbtOptions: PsbtSignatureOptions): Promise<string>;
    signPsbts(psbtHex: string[], psbtOptions: PsbtSignatureOptions): Promise<string[]>;
    pushPsbt(psbtHex: string): Promise<string>;
    on(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
    on(event: 'networkChanged', listener: (network: UnisatNetwork) => void): void;
    on(event: 'chainChanged', listener: (network: UnisatNetwork) => void): void;
    removeListener(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
    removeListener(event: 'networkChanged', listener: (network: UnisatNetwork) => void): void;
}
export {};
