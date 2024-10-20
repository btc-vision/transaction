import { Logger } from '@btc-vision/logger';
import {
    Network,
    Payment,
    payments,
    Psbt,
    PsbtInput,
    PsbtInputExtended,
    Signer,
    Transaction,
} from 'bitcoinjs-lib';
import { TweakedSigner, TweakSettings } from '../../signer/TweakedSigner.js';
import { ECPairInterface } from 'ecpair';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { AddressVerificator } from '../../keypair/AddressVerificator.js';
import { ChainId } from '../../network/ChainId.js';
import { varuint } from 'bitcoinjs-lib/src/bufferutils.js';

export interface ITweakedTransactionData {
    readonly signer: Signer | ECPairInterface;
    readonly network: Network;
    readonly chainId?: ChainId;
    readonly nonWitnessUtxo?: Buffer;
}

/**
 * The transaction sequence
 */
export enum TransactionSequence {
    REPLACE_BY_FEE = 0xfffffffd,
    FINAL = 0xffffffff,
}

/**
 * @description PSBT Transaction processor.
 * */
export abstract class TweakedTransaction extends Logger {
    public readonly logColor: string = '#00ffe1';
    public finalized: boolean = false;
    /**
     * @description Was the transaction signed?
     */
    protected signer: Signer | ECPairInterface;
    /**
     * @description Tweaked signer
     */
    protected tweakedSigner?: ECPairInterface;
    /**
     * @description The network of the transaction
     */
    protected network: Network;
    /**
     * @description Was the transaction signed?
     */
    protected signed: boolean = false;
    /**
     * @description The transaction
     * @protected
     */
    protected abstract readonly transaction: Psbt;
    /**
     * @description The sighash types of the transaction
     * @protected
     */
    protected sighashTypes: number[] | undefined;
    /**
     * @description The script data of the transaction
     */
    protected scriptData: Payment | null = null;
    /**
     * @description The tap data of the transaction
     */
    protected tapData: Payment | null = null;
    /**
     * @description The inputs of the transaction
     */
    protected readonly inputs: PsbtInputExtended[] = [];
    /**
     * @description The sequence of the transaction
     * @protected
     */
    protected sequence: number = TransactionSequence.REPLACE_BY_FEE;
    /**
     * The tap leaf script
     * @protected
     */
    protected tapLeafScript: TapLeafScript | null = null;
    /**
     * Add a non-witness utxo to the transaction
     * @protected
     */
    protected nonWitnessUtxo?: Buffer;

    /**
     * Is the transaction being generated inside a browser?
     * @protected
     */
    protected readonly isBrowser: boolean = false;

    protected regenerated: boolean = false;
    protected ignoreSignatureErrors: boolean = false;

    protected constructor(data: ITweakedTransactionData) {
        super();

        this.signer = data.signer;
        this.network = data.network;

        this.nonWitnessUtxo = data.nonWitnessUtxo;

        this.isBrowser = typeof window !== 'undefined';
    }

    /**
     * Read witnesses
     * @protected
     */
    public static readScriptWitnessToWitnessStack(Buffer: Buffer): Buffer[] {
        let offset = 0;

        function readSlice(n: number): Buffer {
            const slice = Buffer.subarray(offset, offset + n);
            offset += n;
            return slice;
        }

        function readVarInt(): number {
            const varint = varuint.decode(Buffer, offset);
            offset += varuint.decode.bytes;
            return varint;
        }

        function readVarSlice(): Buffer {
            const len = readVarInt();
            return readSlice(len);
        }

        function readVector(): Buffer[] {
            const count = readVarInt();
            const vector = [];
            for (let i = 0; i < count; i++) {
                vector.push(readVarSlice());
            }
            return vector;
        }

        return readVector();
    }

    /**
     * Pre-estimate the transaction fees for a Taproot transaction
     * @param {bigint} feeRate - The fee rate in satoshis per virtual byte
     * @param {bigint} numInputs - The number of inputs
     * @param {bigint} numOutputs - The number of outputs
     * @param {bigint} numWitnessElements - The number of witness elements (e.g., number of control blocks and witnesses)
     * @param {bigint} witnessElementSize - The average size of each witness element in bytes
     * @param {bigint} emptyWitness - The amount of empty witnesses
     * @param {bigint} [taprootControlWitnessSize=139n] - The size of the control block witness in bytes
     * @param {bigint} [taprootScriptSize=32n] - The size of the taproot script in bytes
     * @returns {bigint} - The estimated transaction fees
     */
    public static preEstimateTaprootTransactionFees(
        feeRate: bigint, // satoshis per virtual byte
        numInputs: bigint,
        numOutputs: bigint,
        numWitnessElements: bigint,
        witnessElementSize: bigint,
        emptyWitness: bigint,
        taprootControlWitnessSize: bigint = 32n,
        taprootScriptSize: bigint = 139n,
    ): bigint {
        const txHeaderSize = 10n;
        const inputBaseSize = 41n;
        const outputSize = 68n;
        const taprootWitnessBaseSize = 1n; // Base witness size per input (without signatures and control blocks)

        // Base transaction size (excluding witness data)
        const baseTxSize = txHeaderSize + inputBaseSize * numInputs + outputSize * numOutputs;

        // Witness data size for Taproot
        const witnessSize =
            numInputs * taprootWitnessBaseSize +
            numWitnessElements * witnessElementSize +
            taprootControlWitnessSize * numInputs +
            taprootScriptSize * numInputs +
            emptyWitness;

        // Total weight and virtual size
        const weight = baseTxSize * 3n + (baseTxSize + witnessSize);
        const vSize = weight / 4n;

        return vSize * feeRate;
    }

    protected static signInput(
        transaction: Psbt,
        input: PsbtInput,
        i: number,
        signer: Signer | ECPairInterface,
        sighashTypes: number[],
    ): void {
        if (sighashTypes && sighashTypes[0]) input.sighashType = sighashTypes[0];

        transaction.signInput(i, signer, sighashTypes.length ? sighashTypes : undefined);
    }

    /**
     * Calculate the sign hash number
     * @description Calculates the sign hash
     * @protected
     * @returns {number}
     */
    protected static calculateSignHash(sighashTypes: number[]): number {
        if (!sighashTypes) {
            throw new Error('Sighash types are required');
        }

        let signHash: number = 0;
        for (const sighashType of sighashTypes) {
            signHash |= sighashType;
        }

        return signHash || 0;
    }

    public ignoreSignatureError(): void {
        this.ignoreSignatureErrors = true;
    }

    /**
     * @description Returns the script address
     * @returns {string}
     */
    public getScriptAddress(): string {
        if (!this.scriptData || !this.scriptData.address) {
            throw new Error('Tap data is required');
        }

        return this.scriptData.address;
    }

    /**
     * @description Returns the transaction
     * @returns {Transaction}
     */
    public getTransaction(): Transaction {
        return this.transaction.extractTransaction(false);
    }

    /**
     * @description Returns the tap address
     * @returns {string}
     * @throws {Error} - If tap data is not set
     */
    public getTapAddress(): string {
        if (!this.tapData || !this.tapData.address) {
            throw new Error('Tap data is required');
        }

        return this.tapData.address;
    }

    /**
     * @description Disables replace by fee on the transaction
     */
    public disableRBF(): void {
        if (this.signed) throw new Error('Transaction is already signed');

        this.sequence = TransactionSequence.FINAL;

        for (const input of this.inputs) {
            input.sequence = TransactionSequence.FINAL;
        }
    }

    /**
     * Get the tweaked hash
     * @private
     *
     * @returns {Buffer | undefined} The tweaked hash
     */
    public getTweakerHash(): Buffer | undefined {
        return this.tapData?.hash;
    }

    /**
     * Pre-estimate the transaction fees
     * @param {bigint} feeRate - The fee rate
     * @param {bigint} numInputs - The number of inputs
     * @param {bigint} numOutputs - The number of outputs
     * @param {bigint} numSignatures - The number of signatures
     * @param {bigint} numPubkeys - The number of public keys
     * @returns {bigint} - The estimated transaction fees
     */
    public preEstimateTransactionFees(
        feeRate: bigint, // satoshis per byte
        numInputs: bigint,
        numOutputs: bigint,
        numSignatures: bigint,
        numPubkeys: bigint,
    ): bigint {
        const txHeaderSize = 10n;
        const inputBaseSize = 41n;
        const outputSize = 68n;
        const signatureSize = 144n;
        const pubkeySize = 34n;

        // Base transaction size (excluding witness data)
        const baseTxSize = txHeaderSize + inputBaseSize * numInputs + outputSize * numOutputs;

        // Witness data size
        const redeemScriptSize = 1n + numPubkeys * (1n + pubkeySize) + 1n + numSignatures;
        const witnessSize =
            numSignatures * signatureSize + numPubkeys * pubkeySize + redeemScriptSize;

        // Total weight and virtual size
        const weight = baseTxSize * 3n + (baseTxSize + witnessSize);
        const vSize = weight / 4n;

        return vSize * feeRate;
    }

    protected generateTapData(): Payment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
        };
    }

    /**
     * Generates the script address.
     * @protected
     * @returns {Payment}
     */
    protected generateScriptAddress(): Payment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
        };
    }

    /**
     * Returns the signer key.
     * @protected
     * @returns {Signer | ECPairInterface}
     */
    protected getSignerKey(): Signer | ECPairInterface {
        return this.signer;
    }

    /**
     * Signs an input of the transaction.
     * @param {Psbt} transaction - The transaction to sign
     * @param {PsbtInput} input - The input to sign
     * @param {number} i - The index of the input
     * @param {Signer} [signer] - The signer to use
     * @protected
     */
    protected async signInput(
        transaction: Psbt,
        input: PsbtInput,
        i: number,
        signer?: Signer | ECPairInterface,
    ): Promise<void> {
        const signHash =
            this.sighashTypes && this.sighashTypes.length
                ? [TweakedTransaction.calculateSignHash(this.sighashTypes)]
                : undefined;

        signer = signer || this.getSignerKey();

        let testedTap: boolean = false;
        if (input.tapInternalKey) {
            if (!this.tweakedSigner) this.tweakSigner();

            let tweakedSigner: ECPairInterface | undefined;
            if (signer !== this.signer) {
                tweakedSigner = this.getTweakedSigner(true, signer);
            } else {
                tweakedSigner = this.tweakedSigner;
            }

            if (tweakedSigner) {
                testedTap = true;

                try {
                    if ('signTaprootInput' in signer) {
                        // @ts-expect-error - we know it's a taproot signer
                        return await (signer.signTaprootInput(
                            transaction,
                            i,
                            signHash,
                        ) as Promise<void>);
                    } else {
                        transaction.signTaprootInput(i, tweakedSigner, undefined, signHash);
                    }

                    return;
                } catch {}
            }
        }

        try {
            if ('signInput' in signer) {
                // @ts-expect-error - we know it's a signer
                return await (signer.signInput(transaction, i, signHash) as Promise<void>);
            } else {
                transaction.signInput(i, signer, signHash);
            }
        } catch (e) {
            if (!testedTap) {
                // and we try again taproot...

                if ('signTaprootInput' in signer) {
                    // @ts-expect-error - we know it's a taproot signer
                    return await (signer.signTaprootInput(
                        transaction,
                        i,
                        signHash,
                    ) as Promise<void>);
                } else if (this.tweakedSigner) {
                    transaction.signTaprootInput(i, this.tweakedSigner, undefined, signHash);
                } else {
                    throw e;
                }
            }
        }
    }

    protected splitArray<T>(arr: T[], chunkSize: number): T[][] {
        if (chunkSize <= 0) {
            throw new Error('Chunk size must be greater than 0.');
        }

        const result: T[][] = [];

        for (let i = 0; i < arr.length; i += chunkSize) {
            result.push(arr.slice(i, i + chunkSize));
        }

        return result;
    }

    /**
     * Signs all the inputs of the transaction.
     * @param {Psbt} transaction - The transaction to sign
     * @protected
     * @returns {Promise<void>}
     */
    protected async signInputs(transaction: Psbt): Promise<void> {
        const txs: PsbtInput[] = transaction.data.inputs;

        const batchSize: number = 20;
        const batches = this.splitArray(txs, batchSize);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const promises: Promise<void>[] = [];
            const offset = i * batchSize;

            for (let j = 0; j < batch.length; j++) {
                const index = offset + j;
                const input = batch[j];

                try {
                    promises.push(this.signInput(transaction, input, index));
                } catch (e) {
                    this.log(`Failed to sign input ${index}: ${(e as Error).stack}`);
                }
            }

            await Promise.all(promises);
        }

        try {
            transaction.finalizeAllInputs();

            this.finalized = true;
        } catch (e) {
            this.finalized = false;
        }
    }

    /**
     * Converts the public key to x-only.
     * @protected
     * @returns {Buffer}
     */
    protected internalPubKeyToXOnly(): Buffer {
        return toXOnly(Buffer.from(this.signer.publicKey));
    }

    /**
     * Internal init.
     * @protected
     */
    protected internalInit(): void {
        this.scriptData = payments.p2tr(this.generateScriptAddress());
        this.tapData = payments.p2tr(this.generateTapData());
    }

    /**
     * Tweak the signer for the interaction
     * @protected
     */
    protected tweakSigner(): void {
        if (this.tweakedSigner) return;

        // tweaked p2tr signer.
        this.tweakedSigner = this.getTweakedSigner(true);
    }

    /**
     * Get the tweaked signer
     * @private
     * @returns {ECPairInterface} The tweaked signer
     */
    protected getTweakedSigner(
        useTweakedHash: boolean = false,
        signer: Signer | ECPairInterface = this.signer,
    ): ECPairInterface | undefined {
        const settings: TweakSettings = {
            network: this.network,
        };

        if (useTweakedHash) {
            settings.tweakHash = this.getTweakerHash();
        }

        if (!('privateKey' in signer)) {
            return;
        }

        return TweakedSigner.tweakSigner(signer as unknown as ECPairInterface, settings);
    }

    /**
     * Generate the PSBT input extended
     * @param {UTXO} utxo The UTXO
     * @param {number} i The index of the input
     * @protected
     * @returns {PsbtInputExtended} The PSBT input extended
     */
    protected generatePsbtInputExtended(utxo: UTXO, i: number): PsbtInputExtended {
        const input: PsbtInputExtended = {
            hash: utxo.transactionId,
            index: utxo.outputIndex,
            witnessUtxo: {
                value: Number(utxo.value),
                script: Buffer.from(utxo.scriptPubKey.hex, 'hex'),
            },
            sequence: this.sequence,
        };

        if (this.sighashTypes) {
            const inputSign = TweakedTransaction.calculateSignHash(this.sighashTypes);
            if (inputSign) input.sighashType = inputSign;
        }

        if (this.tapLeafScript) {
            input.tapLeafScript = [this.tapLeafScript];
        }

        if (i === 0 && this.nonWitnessUtxo) {
            input.nonWitnessUtxo = this.nonWitnessUtxo;
            this.log(`Using non-witness utxo for input ${i}`);
        }

        // automatically detect p2tr inputs.
        if (
            utxo.scriptPubKey.address &&
            AddressVerificator.isValidP2TRAddress(utxo.scriptPubKey.address, this.network)
        ) {
            this.tweakSigner();

            input.tapInternalKey = this.internalPubKeyToXOnly();
        }

        return input;
    }
}
