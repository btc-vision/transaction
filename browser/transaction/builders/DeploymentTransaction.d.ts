/// <reference types="node" />
import { TransactionType } from '../enums/TransactionType.js';
import { IDeploymentParameters } from '../interfaces/ITransactionParameters.js';
import { Payment, Psbt } from 'bitcoinjs-lib';
import { TransactionBuilder } from './TransactionBuilder.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { Address } from '@btc-vision/bsi-binary';
export declare class DeploymentTransaction extends TransactionBuilder<TransactionType.DEPLOYMENT> {
    type: TransactionType.DEPLOYMENT;
    protected readonly _contractAddress: Address;
    protected tapLeafScript: TapLeafScript | null;
    private targetScriptRedeem;
    private leftOverFundsScriptRedeem;
    private readonly compiledTargetScript;
    private readonly scriptTree;
    private deploymentGenerator;
    private readonly contractSeed;
    private readonly bytecode;
    private readonly contractSigner;
    private readonly randomBytes;
    constructor(parameters: IDeploymentParameters);
    get contractAddress(): Address;
    get p2trAddress(): Address;
    getRndBytes(): Buffer;
    protected contractSignerXOnlyPubKey(): Buffer;
    protected buildTransaction(): void;
    protected signInputs(transaction: Psbt): void;
    protected generateScriptAddress(): Payment;
    protected generateTapData(): Payment;
    private getContractSeed;
    private customFinalizer;
    private getPubKeys;
    private generateRedeemScripts;
    private getLeafScript;
    private getScriptTree;
}
