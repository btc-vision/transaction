import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { IUnwrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { AddressVerificator } from '../../keypair/AddressVerificator.js';
import { Network, Transaction } from 'bitcoinjs-lib';
import { TransactionBuilder } from './TransactionBuilder.js';
import { ABICoder, Address, BinaryWriter, Selector } from '@btc-vision/bsi-binary';
import { ECPairInterface } from 'ecpair';
import { wBTC } from '../../metadata/contracts/wBTC.js';

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
     * The tap leaf script
     * @protected
     */
    protected tapLeafScript: TapLeafScript | null = null;

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

        const receiver: Address = TransactionBuilder.getFrom(
            parameters.from,
            parameters.signer as ECPairInterface,
            parameters.network,
        );

        parameters.calldata = UnwrapTransaction.generateBurnCalldata(
            parameters.amount,
            receiver,
            parameters.network,
        );

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
     * @param {Address} to - The address to send the wrapped tokens to
     * @param {Network} network - The network to use
     * @private
     * @returns {Buffer} - The calldata
     */
    private static generateBurnCalldata(amount: bigint, to: Address, network: Network): Buffer {
        if (!amount) throw new Error('Amount is required');
        if (!to) throw new Error('To address is required');

        if (!AddressVerificator.isValidP2TRAddress(to, network)) {
            throw new Error(
                `Oops! The address ${to} is not a valid P2TR address! If you wrap at this address, your funds will be lost!`,
            );
        }

        const bufWriter: BinaryWriter = new BinaryWriter();
        bufWriter.writeSelector(UnwrapTransaction.UNWRAP_SELECTOR);
        bufWriter.writeAddress(to);
        bufWriter.writeU256(amount);

        return Buffer.from(bufWriter.getBuffer());
    }
}
