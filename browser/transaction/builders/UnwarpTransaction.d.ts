/// <reference types="node" />
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
export declare class UnwrapTransaction extends SharedInteractionTransaction<TransactionType.WBTC_UNWRAP> {
    private static readonly UNWRAP_SELECTOR;
    type: TransactionType.WBTC_UNWRAP;
    readonly amount: bigint;
    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;
    protected readonly sighashTypes: number[];
    protected readonly contractSecret: Buffer;
    private readonly wbtc;
    constructor(parameters: IUnwrapParameters);
    static generateBurnCalldata(amount: bigint): Buffer;
}
