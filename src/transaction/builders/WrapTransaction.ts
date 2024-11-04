import { Taptree } from '@btc-vision/bitcoin/src/types.js';
import { TransactionType } from '../enums/TransactionType.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { IWrapParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { wBTC } from '../../metadata/contracts/wBTC.js';
import { WrappedGeneration } from '../../wbtc/WrappedGenerationParameters.js';
import { BitcoinUtils } from '../../utils/BitcoinUtils.js';
import { Network, PsbtOutputExtendedAddress } from '@btc-vision/bitcoin';
import { P2TR_MS } from '../shared/P2TR_MS.js';
import { currentConsensusConfig } from '../../consensus/ConsensusConfig.js';
import { Selector } from '../../utils/types.js';
import { ABICoder } from '../../abi/ABICoder.js';
import { BinaryWriter } from '../../buffer/BinaryWriter.js';
import { Address } from '../../keypair/Address.js';

const abiCoder: ABICoder = new ABICoder();

/**
 * Wrapped Bitcoin transaction wrap interaction
 * @class InteractionTransaction
 */
export class WrapTransaction extends SharedInteractionTransaction<TransactionType.WBTC_WRAP> {
    private static readonly WRAP_SELECTOR: Selector = Number(
        '0x' + abiCoder.encodeSelector('mint'),
    );

    public type: TransactionType.WBTC_WRAP = TransactionType.WBTC_WRAP;

    /**
     * The vault address
     * @private
     * @readonly
     */
    public readonly vault: string;

    /**
     * The amount to wrap
     * @private
     */
    public readonly amount: bigint;

    /**
     * The receiver of the wrapped tokens
     * @private
     */
    public readonly receiver: Address;

    /**
     * The compiled target script
     * @protected
     */
    protected readonly compiledTargetScript: Buffer;

    /**
     * Tap tree for the interaction
     * @protected
     */
    protected readonly scriptTree: Taptree;

    /**
     * Tap leaf script
     * @protected
     */
    protected tapLeafScript: TapLeafScript | null = null;

    /**
     * Contract secret for the interaction
     * @protected
     */
    protected readonly contractSecret: Buffer;
    /**
     * Public keys specified in the interaction
     * @protected
     */
    protected readonly interactionPubKeys: Buffer[] = [];
    /**
     * Minimum signatures required for the interaction
     * @protected
     */
    protected readonly minimumSignatures: number = 0;
    /**
     * The wBTC contract
     * @private
     */
    private readonly wbtc: wBTC;

    public constructor(parameters: IWrapParameters) {
        if (parameters.amount < currentConsensusConfig.VAULT_MINIMUM_AMOUNT) {
            throw new Error(
                `Amount is below the minimum required of ${currentConsensusConfig.VAULT_MINIMUM_AMOUNT} sat.`,
            );
        }

        const receiver: Address = parameters.receiver || new Address(parameters.signer.publicKey);

        parameters.calldata = WrapTransaction.generateMintCalldata(
            parameters.amount,
            receiver,
            parameters.network,
        );

        super(parameters);

        this.wbtc = new wBTC(parameters.network, parameters.chainId);
        this.vault = parameters.generationParameters.vault;

        this.to = this.wbtc.getAddress();
        this.receiver = receiver;
        this.amount = parameters.amount;

        this.verifyRequiredValue();

        this.interactionPubKeys = parameters.generationParameters.pubKeys;
        this.minimumSignatures = parameters.generationParameters.constraints.minimum;
        this.contractSecret = this.generateSecret();

        if (!this.verifyPublicKeysConstraints(parameters.generationParameters)) {
            throw new Error(
                'Oops. Your wrapping request have been decline! It failed security checks!',
            );
        }

        this.compiledTargetScript = this.calldataGenerator.compile(
            this.calldata,
            this.contractSecret,
            [],
            this.interactionPubKeys,
            this.minimumSignatures,
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
    private static generateMintCalldata(amount: bigint, to: Address, network: Network): Buffer {
        if (!amount) throw new Error('Amount is required');
        if (!to) throw new Error('To address is required');

        if (!to.isValid(network)) {
            throw new Error(
                `Oops! The address ${to} is not a valid P2TR address! If you wrap at this address, your funds will be lost!`,
            );
        }

        const bufWriter: BinaryWriter = new BinaryWriter();
        bufWriter.writeSelector(WrapTransaction.WRAP_SELECTOR);
        bufWriter.writeAddress(to);
        bufWriter.writeU256(amount);

        return Buffer.from(bufWriter.getBuffer());
    }

    /**
     * Verify the data integrity received by the client.
     * @param {WrappedGeneration} generation - The generation parameters
     * @returns {boolean} - True if the data is valid
     * @throws {Error} - If the data is invalid
     */
    public verifyPublicKeysConstraints(generation: WrappedGeneration): boolean {
        if (generation.constraints.minimum < 2) {
            throw new Error('Minimum signatures must be at least 2');
        }

        if (
            generation.keys.length < generation.constraints.transactionMinimum ||
            generation.keys.length < generation.constraints.minimum
        ) {
            throw new Error('Not enough pub keys');
        }

        if (generation.keys.length > 255) {
            throw new Error('Too many pub keys');
        }

        const generatedVault: string = this.generateVaultAddress(
            generation.pubKeys,
            generation.constraints.minimum,
        );
        if (generatedVault !== generation.vault) {
            throw new Error(
                `Invalid vault address. Expected: ${generatedVault} Got: ${generation.vault}`,
            );
        }

        const passChecksum: Buffer = this.generateChecksumSalt(
            generation,
            this.amount,
            generation.vault,
        );

        const checksum: string = BitcoinUtils.opnetHash(passChecksum);
        if (checksum !== generation.signature) {
            throw new Error(`Invalid checksum. Expected: ${checksum} Got: ${generation.signature}`);
        }

        return true;
    }

    /**
     * Build the transaction
     * @protected
     *
     * @throws {Error} If the leftover funds script redeem is required
     * @throws {Error} If the leftover funds script redeem version is required
     * @throws {Error} If the leftover funds script redeem output is required
     * @throws {Error} If the to address is required
     */
    protected override async buildTransaction(): Promise<void> {
        if (!this.to) throw new Error('To address is required');

        const selectedRedeem = this.scriptSigner
            ? this.targetScriptRedeem
            : this.leftOverFundsScriptRedeem;

        if (!selectedRedeem) {
            throw new Error('Left over funds script redeem is required');
        }

        if (!selectedRedeem.redeemVersion) {
            throw new Error('Left over funds script redeem version is required');
        }

        if (!selectedRedeem.output) {
            throw new Error('Left over funds script redeem output is required');
        }

        this.tapLeafScript = {
            leafVersion: selectedRedeem.redeemVersion,
            script: selectedRedeem.output,
            controlBlock: this.getWitness(),
        };

        this.addInputsFromUTXO();

        const amountSpent: bigint = this.getTransactionOPNetFee();
        this.addOutput({
            value: Number(amountSpent),
            address: this.to,
        });

        this.addVaultOutput();
        await this.addRefundOutput(
            amountSpent +
                this.amount +
                currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT,
        );
    }

    /**
     * Verify if the required value is available
     * @private
     */
    private verifyRequiredValue(): void {
        if (this.totalInputAmount < this.amount) {
            throw new Error(
                `Not enough funds to wrap the amount specified. ${this.totalInputAmount} < ${this.amount}`,
            );
        }

        const valueToVault: bigint =
            this.amount + currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT; //this.priorityFee

        if (this.totalInputAmount < valueToVault) {
            throw new Error(
                `Not enough funds to wrap the amount specified. ${this.totalInputAmount} < ${valueToVault}. Make sure that your inputs cover the amount to wrap, the priority fee and the unwrap prepaid fees.`,
            );
        }
    }

    /**
     * Add the vault output
     * @private
     * @throws {Error} If no vault address is provided
     * @throws {Error} If the amount is not a number
     */
    private addVaultOutput(): void {
        if (!this.vault) {
            throw new Error(`No vault address provided`);
        }

        const valueToSend: bigint =
            this.amount + currentConsensusConfig.UNWRAP_CONSOLIDATION_PREPAID_FEES_SAT;

        const amountOutput: PsbtOutputExtendedAddress = {
            address: this.vault,
            value: Number(valueToSend),
        };

        this.addOutput(amountOutput);
    }

    /**
     * Generate a vault address
     * @param {Buffer[]} keys
     * @param {number} minimumSignatureRequired
     * @private
     * @returns {string}
     */
    private generateVaultAddress(keys: Buffer[], minimumSignatureRequired: number): string {
        return P2TR_MS.generateMultiSigAddress(keys, minimumSignatureRequired, this.network);
    }

    /**
     * Generate a wrapped checksum hash
     * @param {WrappedGeneration} param
     * @param {bigint} amount
     * @param {string} vault
     * @private
     * @returns {Buffer}
     */
    private generateChecksumSalt(param: WrappedGeneration, amount: bigint, vault: string): Buffer {
        const version: string = param.constraints.version;
        const timestamp: number = param.constraints.timestamp;

        const params: Buffer = Buffer.alloc(12 + version.length);
        params.writeBigInt64BE(BigInt(timestamp), 0);
        params.writeInt16BE(param.constraints.minimum, 8);
        params.writeInt16BE(param.constraints.transactionMinimum, 10);
        params.write(version, 12, version.length, 'utf-8');

        return Buffer.concat([
            ...param.pubKeys,
            ...param.entities.map((entity: string) => Buffer.from(entity, 'utf-8')),
            params,
            Buffer.from(amount.toString(), 'utf-8'),
            Buffer.from(vault, 'utf-8'),
        ]);
    }
}
