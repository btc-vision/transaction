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
    finalized: boolean;
    protected signer: Signer;
    protected tweakedSigner?: Signer;
    protected network: Network;
    protected signed: boolean;
    protected abstract readonly transaction: Psbt;
    protected sighashTypes: number[] | undefined;
    protected scriptData: Payment | null;
    protected tapData: Payment | null;
    protected readonly inputs: PsbtInputExtended[];
    protected sequence: number;
    protected tapLeafScript: TapLeafScript | null;
    protected nonWitnessUtxo?: Buffer;
    protected regenerated: boolean;
    protected ignoreSignatureErrors: boolean;
    protected constructor(data: ITweakedTransactionData);
    static readScriptWitnessToWitnessStack(buffer: Buffer): Buffer[];
    protected static signInput(transaction: Psbt, input: PsbtInput, i: number, signer: Signer, sighashTypes: number[]): void;
    protected static calculateSignHash(sighashTypes: number[]): number;
    ignoreSignatureError(): void;
    getScriptAddress(): string;
    getTransaction(): Transaction;
    getTapAddress(): string;
    disableRBF(): void;
    getTweakerHash(): Buffer | undefined;
    preEstimateTransactionFees(feeRate: bigint, numInputs: bigint, numOutputs: bigint, numSignatures: bigint, numPubkeys: bigint): bigint;
    preEstimateTaprootTransactionFees(feeRate: bigint, numInputs: bigint, numOutputs: bigint, numWitnessElements: bigint, witnessElementSize: bigint, emptyWitness: bigint, taprootControlWitnessSize?: bigint, taprootScriptSize?: bigint): bigint;
    protected generateTapData(): Payment;
    protected generateScriptAddress(): Payment;
    protected getSignerKey(): Signer;
    protected signInput(transaction: Psbt, input: PsbtInput, i: number, signer?: Signer): void;
    protected signInputs(transaction: Psbt): void;
    protected internalPubKeyToXOnly(): Buffer;
    protected internalInit(): void;
    protected tweakSigner(): void;
    protected getTweakedSigner(useTweakedHash?: boolean, signer?: Signer): Signer;
    protected generatePsbtInputExtended(utxo: UTXO, i: number): PsbtInputExtended;
}
