/// <reference types="node" />
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { Psbt } from 'bitcoinjs-lib';
import { VaultUTXOs } from '../processor/PsbtTransaction.js';
export declare class UnwrapSegwitTransaction extends SharedInteractionTransaction<TransactionType.WBTC_UNWRAP> {
    private static readonly UNWRAP_SELECTOR;
    type: TransactionType.WBTC_UNWRAP;
    readonly amount: bigint;
    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;
    protected sighashTypes: number[];
    protected readonly contractSecret: Buffer;
    protected readonly vaultUTXOs: VaultUTXOs[];
    private readonly wbtc;
    private readonly calculatedSignHash;
    constructor(parameters: IUnwrapParameters);
    static generateBurnCalldata(amount: bigint): Buffer;
    signPSBT(): Psbt;
    mergeVaults(input: VaultUTXOs[]): void;
    protected internalBuildTransaction(transaction: Psbt): boolean;
    protected generateMultiSignRedeemScript(publicKeys: string[], minimum: number): {
        witnessUtxo: Buffer;
        redeemScript: Buffer;
        witnessScript: Buffer;
    };
    private addVaultUTXO;
    private addVaultInputs;
    private calculateOutputLeftAmountFromVaults;
    private getVaultTotalOutputAmount;
}
