import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { TransactionBuilder } from './TransactionBuilder.js';
import { ABICoder, BinaryWriter, Selector } from '@btc-vision/bsi-binary';
import { wBTC } from '../../metadata/contracts/wBTC.js';
import { Transaction } from 'bitcoinjs-lib';

const abiCoder: ABICoder = new ABICoder();

/**
 * Unwrap transaction
 * @class UnwrapTransaction
 */
export class UnwrapTransaction extends SharedInteractionTransaction<TransactionType.WBTC_UNWRAP> {
    private static readonly UNWRAP_SELECTOR: Selector = Number(
        '0x' + abiCoder.encodeSelector('burn'),
    );

    public type: TransactionType.WBTC_UNWRAP = TransactionType.WBTC_UNWRAP;

    /**
     * The amount to wrap
     * @private
     */
    public readonly amount: bigint;

    /**
     * The compiled target script
     * @protected
     */
    protected readonly compiledTargetScript: Buffer;

    /**
     * The script tree
     * @protected
     */
    protected readonly scriptTree: Taptree;

    /**
     * The sighash types for the transaction
     * @protected
     */
    protected readonly sighashTypes: number[] = [
        Transaction.SIGHASH_SINGLE,
        Transaction.SIGHASH_ANYONECANPAY,
    ];

    /**
     * Contract secret for the interaction
     * @protected
     */
    protected readonly contractSecret: Buffer;

    /**
     * The wBTC contract
     * @private
     */
    private readonly wbtc: wBTC;

    public constructor(parameters: IUnwrapParameters) {
        if (parameters.amount < TransactionBuilder.MINIMUM_DUST) {
            throw new Error('Amount is below dust limit');
        }

        parameters.disableAutoRefund = true; // we have to disable auto refund for this transaction, so it does not create an unwanted output.
        parameters.calldata = UnwrapTransaction.generateBurnCalldata(parameters.amount);

        super(parameters);

        this.wbtc = new wBTC(parameters.network);
        this.to = this.wbtc.getAddress();

        this.amount = parameters.amount;
        this.contractSecret = this.generateSecret();

        this.compiledTargetScript = this.calldataGenerator.compile(
            this.calldata,
            this.contractSecret,
        );

        this.scriptTree = this.getScriptTree();
        this.internalInit();
    }

    /**
     * Generate a valid wBTC calldata
     * @param {bigint} amount - The amount to wrap
     * @private
     * @returns {Buffer} - The calldata
     */
    public static generateBurnCalldata(amount: bigint): Buffer {
        if (!amount) throw new Error('Amount is required');

        const bufWriter: BinaryWriter = new BinaryWriter();
        bufWriter.writeSelector(UnwrapTransaction.UNWRAP_SELECTOR);
        bufWriter.writeU256(amount);

        return Buffer.from(bufWriter.getBuffer());
    }
}
