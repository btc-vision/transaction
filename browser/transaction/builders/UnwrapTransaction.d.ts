/// <reference types="node" />
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { Network, Payment, Psbt } from 'bitcoinjs-lib';
import { VaultUTXOs } from '../processor/PsbtTransaction.js';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
export declare class UnwrapTransaction extends SharedInteractionTransaction<TransactionType.WBTC_UNWRAP> {
    private static readonly UNWRAP_SELECTOR;
    type: TransactionType.WBTC_UNWRAP;
    readonly amount: bigint;
    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;
    protected sighashTypes: number[];
    protected readonly contractSecret: Buffer;
    protected readonly vaultUTXOs: VaultUTXOs[];
    protected readonly estimatedFeeLoss: bigint;
    private readonly wbtc;
    private readonly calculatedSignHash;
    constructor(parameters: IUnwrapParameters);
    static generateBurnCalldata(amount: bigint): Buffer;
    signPSBT(): Promise<Psbt>;
    getRefund(): bigint;
    getFeeLossOrRefund(): bigint;
    protected mergeVaults(): void;
    protected calculateNumEmptyWitnesses(vault: VaultUTXOs[]): bigint;
    protected calculateNumSignatures(vault: VaultUTXOs[]): bigint;
    protected calculateNumInputs(vault: VaultUTXOs[]): bigint;
    protected internalPubKeyToXOnly(): Buffer;
    protected generateTapDataForInput(pubkeys: Buffer[], minimumSignatures: number): {
        internalPubkey: Buffer;
        network: Network;
        scriptTree: Taptree;
        redeem: Payment;
    };
    protected getScriptSolution(input: PsbtInput): Buffer[];
    protected internalBuildTransaction(transaction: Psbt): Promise<boolean>;
    private addVaultUTXO;
    private addVaultInputs;
    private calculateOutputLeftAmountFromVaults;
    private getVaultTotalOutputAmount;
}
