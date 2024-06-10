/// <reference types="node" />
import { Network, Payment, Psbt, Signer, Transaction } from 'bitcoinjs-lib';
import { PsbtInputExtended, PsbtOutputExtended, UpdateInput } from '../interfaces/Tap.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IFundingTransactionParameters, ITransactionParameters } from '../interfaces/ITransactionParameters.js';
import { Address } from '@btc-vision/bsi-binary';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { ECPairInterface } from 'ecpair';
import { Logger } from '@btc-vision/logger';
export declare enum TransactionSequence {
    REPLACE_BY_FEE = 4294967293,
    FINAL = 4294967295
}
export declare abstract class TransactionBuilder<T extends TransactionType> extends Logger {
    static readonly LOCK_LEAF_SCRIPT: Buffer;
    static readonly MINIMUM_DUST: bigint;
    abstract readonly type: T;
    readonly logColor: string;
    overflowFees: bigint;
    transactionFee: bigint;
    protected sequence: number;
    protected readonly transaction: Psbt;
    protected readonly inputs: PsbtInputExtended[];
    protected readonly updateInputs: UpdateInput[];
    protected readonly outputs: PsbtOutputExtended[];
    protected feeOutput: PsbtOutputExtended | null;
    protected signed: boolean;
    protected tapData: Payment | null;
    protected scriptData: Payment | null;
    protected totalInputAmount: bigint;
    protected readonly signer: Signer;
    protected readonly network: Network;
    protected readonly feeRate: number;
    protected priorityFee: bigint;
    protected utxos: UTXO[];
    protected to: Address | undefined;
    protected from: Address;
    private _maximumFeeRate;
    protected constructor(parameters: ITransactionParameters);
    static getFrom(from: string | undefined, keypair: ECPairInterface, network: Network): Address;
    getFundingTransactionParameters(): IFundingTransactionParameters;
    setDestinationAddress(address: Address): void;
    setMaximumFeeRate(feeRate: number): void;
    signTransaction(): Transaction;
    getTransaction(): Transaction;
    getScriptAddress(): string;
    disableRBF(): void;
    getTapAddress(): string;
    addInput(input: PsbtInputExtended): void;
    addOutput(output: PsbtOutputExtended): void;
    estimateTransactionFees(): bigint;
    protected addRefundOutput(amountSpent: bigint): void;
    protected addValueToToOutput(value: number | bigint): void;
    protected getTransactionOPNetFee(): bigint;
    protected calculateTotalUTXOAmount(): bigint;
    protected calculateTotalVOutAmount(): bigint;
    protected addInputsFromUTXO(): void;
    protected witnessStackToScriptWitness(witness: Buffer[]): Buffer;
    protected internalInit(): void;
    protected abstract buildTransaction(): void;
    protected generateScriptAddress(): Payment;
    protected generateTapData(): Payment;
    protected updateInput(input: UpdateInput): void;
    protected getWitness(): Buffer;
    protected getTapOutput(): Buffer;
    protected getInputs(): PsbtInputExtended[];
    protected getOutputs(): PsbtOutputExtended[];
    protected verifyUTXOValidity(): void;
    protected setFeeOutput(output: PsbtOutputExtended): void;
    protected abstract getSignerKey(): Signer;
    protected internalPubKeyToXOnly(): Buffer;
    protected signInputs(transaction: Psbt): void;
    private internalBuildTransaction;
}
