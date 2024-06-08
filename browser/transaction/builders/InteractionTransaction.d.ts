/// <reference types="node" />
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
export declare class InteractionTransaction extends SharedInteractionTransaction<TransactionType.INTERACTION> {
    type: TransactionType.INTERACTION;
    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;
    protected tapLeafScript: TapLeafScript | null;
    protected readonly contractSecret: Buffer;
    constructor(parameters: IInteractionParameters);
}
