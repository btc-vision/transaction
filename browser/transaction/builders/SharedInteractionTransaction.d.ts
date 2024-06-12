/// <reference types="node" />
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { Payment, Psbt, Signer } from 'bitcoinjs-lib';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { ECPairInterface } from 'ecpair';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TransactionType } from '../enums/TransactionType.js';
import { CalldataGenerator } from '../../generators/builders/CalldataGenerator.js';
import { SharedInteractionParameters } from '../interfaces/ITransactionParameters.js';
export declare abstract class SharedInteractionTransaction<T extends TransactionType> extends TransactionBuilder<T> {
    readonly randomBytes: Buffer;
    protected targetScriptRedeem: Payment | null;
    protected leftOverFundsScriptRedeem: Payment | null;
    protected abstract readonly compiledTargetScript: Buffer;
    protected abstract readonly scriptTree: Taptree;
    protected readonly calldataGenerator: CalldataGenerator;
    protected readonly calldata: Buffer;
    protected abstract readonly contractSecret: Buffer;
    protected readonly scriptSigner: Signer;
    protected constructor(parameters: SharedInteractionParameters);
    getContractSecret(): Buffer;
    getRndBytes(): Buffer;
    protected generateSecret(): Buffer;
    protected scriptSignerXOnlyPubKey(): Buffer;
    protected generateKeyPairFromSeed(): ECPairInterface;
    protected buildTransaction(): void;
    protected signInputs(transaction: Psbt): void;
    protected generateScriptAddress(): Payment;
    protected generateTapData(): Payment;
    protected getScriptSolution(input: PsbtInput): Buffer[];
    protected getScriptTree(): Taptree;
    private getPubKeys;
    private customFinalizer;
    private generateRedeemScripts;
    private getLeafScript;
}
