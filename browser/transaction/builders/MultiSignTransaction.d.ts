/// <reference types="node" />
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { Network, Payment, Psbt, Signer } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TransactionType } from '../enums/TransactionType.js';
import { ITransactionParameters } from '../interfaces/ITransactionParameters.js';
import { MultiSignGenerator } from '../../generators/builders/MultiSignGenerator.js';
import { Address } from '@btc-vision/bsi-binary';
export interface MultiSignParameters extends Omit<ITransactionParameters, 'signer' | 'priorityFee'> {
    readonly pubkeys: Buffer[];
    readonly minimumSignatures: number;
    readonly from?: undefined;
    readonly to?: undefined;
    readonly psbt?: Psbt;
    readonly receiver: Address;
    readonly requestedAmount: bigint;
    readonly refundVault: Address;
}
export interface MultiSignFromBase64Params extends Omit<MultiSignParameters, 'psbt'> {
    readonly psbt: string;
}
export declare class MultiSignTransaction extends TransactionBuilder<TransactionType.MULTI_SIG> {
    static readonly LOCK_LEAF_SCRIPT: Buffer;
    static readonly signHashTypesArray: number[];
    type: TransactionType.MULTI_SIG;
    protected targetScriptRedeem: Payment | null;
    protected leftOverFundsScriptRedeem: Payment | null;
    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;
    protected readonly multisignGenerator: MultiSignGenerator;
    protected readonly publicKeys: Buffer[];
    protected readonly minimumSignatures: number;
    protected readonly originalInputCount: number;
    protected readonly requestedAmount: bigint;
    protected readonly receiver: Address;
    protected readonly refundVault: Address;
    protected readonly sighashTypes: number[];
    constructor(parameters: MultiSignParameters);
    static getSharedSigner(network: Network): Signer;
    static fromBase64(params: MultiSignFromBase64Params): MultiSignTransaction;
    static signPartial(psbt: Psbt, signer: Signer, originalInputCount: number, network: Network): boolean;
    static partialFinalizer: (inputIndex: number, input: PsbtInput) => {
        finalScriptWitness: Buffer;
    };
    static attemptFinalizeInputs(psbt: Psbt, startIndex: number, network: Network): boolean;
    finalizeTransactionInputs(): boolean;
    signWithSigner(signer: Signer): boolean;
    signPSBT(): Psbt;
    protected buildTransaction(): void;
    protected internalBuildTransaction(transaction: Psbt): boolean;
    protected signInputs(_transaction: Psbt): void;
    protected generateScriptAddress(): Payment;
    protected generateTapData(): Payment;
    protected getScriptSolution(input: PsbtInput): Buffer[];
    protected getScriptTree(): Taptree;
    private getTotalOutputAmount;
    private calculateOutputLeftAmountFromVaults;
    private customFinalizer;
    private generateRedeemScripts;
}
