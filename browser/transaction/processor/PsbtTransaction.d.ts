import { Network, Psbt, Signer, Transaction } from 'bitcoinjs-lib';
import { ITweakedTransactionData, TweakedTransaction } from '../shared/TweakedTransaction.js';
import { PsbtInputExtended, PsbtOutputExtended } from '../interfaces/Tap.js';
import { Address } from '@btc-vision/bsi-binary';
export interface PsbtTransactionData extends ITweakedTransactionData {
    readonly psbt: Psbt;
    readonly signer: Signer;
    readonly network: Network;
}
export interface IWBTCUTXODocument {
    readonly vault: Address;
    readonly blockId: bigint;
    readonly hash: string;
    readonly value: bigint;
    readonly outputIndex: number;
    readonly output: string;
}
export interface VaultUTXOs {
    readonly vault: Address;
    readonly publicKeys: Address[];
    readonly minimum: number;
    readonly utxos: IWBTCUTXODocument[];
}
export type FromBase64Params = Omit<PsbtTransactionData, 'psbt'>;
export declare class PsbtTransaction extends TweakedTransaction {
    readonly logColor: string;
    feesAddition: bigint;
    protected readonly transaction: Psbt;
    protected readonly sighashTypes: number[] | undefined;
    constructor(data: PsbtTransactionData);
    static fromBase64(data: string, params: FromBase64Params): PsbtTransaction;
    static fromHex(data: string, params: FromBase64Params): PsbtTransaction;
    static from(params: FromBase64Params): PsbtTransaction;
    extractTransaction(): Transaction;
    final(): string;
    toHex(): string;
    addInput(input: PsbtInputExtended): void;
    addOutput(output: PsbtOutputExtended): void;
    attemptFinalizeInputs(n?: number): boolean;
    getPSBT(): Psbt;
    private getTotalOutputAmount;
}
