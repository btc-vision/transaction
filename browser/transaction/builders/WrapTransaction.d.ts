/// <reference types="node" />
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { IWrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { Address } from '@btc-vision/bsi-binary';
import { WrappedGeneration } from '../../wbtc/WrappedGenerationParameters.js';
export declare class WrapTransaction extends SharedInteractionTransaction<TransactionType.WBTC_WRAP> {
    private static readonly WRAP_SELECTOR;
    type: TransactionType.WBTC_WRAP;
    readonly vault: Address;
    readonly amount: bigint;
    readonly receiver: Address;
    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;
    protected tapLeafScript: TapLeafScript | null;
    protected readonly contractSecret: Buffer;
    protected readonly interactionPubKeys: Buffer[];
    protected readonly minimumSignatures: number;
    private readonly wbtc;
    constructor(parameters: IWrapParameters);
    private static generateMintCalldata;
    verifyPublicKeysConstraints(generation: WrappedGeneration): boolean;
    protected buildTransaction(): Promise<void>;
    private verifyRequiredValue;
    private addVaultOutput;
    private generateVaultAddress;
    private generateChecksumSalt;
}
