import { Address } from '@btc-vision/bsi-binary';
export declare enum UnisatNetwork {
    testnet = "testnet",
    mainnet = "livenet",
    regtest = "regtest"
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
    sendBitcoin(toAddress: Address, satoshis: number, options: {
        feeRate: number;
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
    removeListener(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
    removeListener(event: 'networkChanged', listener: (network: UnisatNetwork) => void): void;
}
export {};
