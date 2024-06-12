/// <reference types="node" />
import { Logger } from '@btc-vision/logger';
import { Network, Payment, Psbt, Signer, Transaction } from 'bitcoinjs-lib';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { PsbtInputExtended, TapLeafScript } from '../interfaces/Tap.js';
export interface ITweakedTransactionData {
    readonly signer: Signer;
    readonly network: Network;
    readonly nonWitnessUtxo?: Buffer;
}
export declare enum TransactionSequence {
    REPLACE_BY_FEE = 4294967293,
    FINAL = 4294967295
}
export declare abstract class TweakedTransaction extends Logger {
    readonly logColor: string;
    protected signer: Signer;
    protected tweakedSigner?: Signer;
    protected network: Network;
    protected signed: boolean;
    protected abstract readonly transaction: Psbt;
    protected readonly sighashTypes: number[] | undefined;
    protected scriptData: Payment | null;
    protected tapData: Payment | null;
    protected readonly inputs: PsbtInputExtended[];
    protected sequence: number;
    protected tapLeafScript: TapLeafScript | null;
    protected nonWitnessUtxo?: Buffer;
    protected constructor(data: ITweakedTransactionData);
    getScriptAddress(): string;
    getTransaction(): Transaction;
    getTapAddress(): string;
    toBase64(): string;
    disableRBF(): void;
    protected generateTapData(): Payment;
    protected generateScriptAddress(): Payment;
    protected getSignerKey(): Signer;
    protected signInput(transaction: Psbt, input: PsbtInput, i: number, signer?: Signer): void;
    protected signInputs(transaction: Psbt): void;
    protected calculateSignHash(): number;
    protected internalPubKeyToXOnly(): Buffer;
    protected internalInit(): void;
    protected tweakSigner(): void;
    protected getTweakedSigner(useTweakedHash?: boolean): Signer;
    protected getTweakerHash(): Buffer | undefined;
    protected generatePsbtInputExtended(utxo: UTXO, i: number): PsbtInputExtended;
}
