import { Logger } from '@btc-vision/logger';
import {
    address as bitAddress,
    crypto as bitCrypto,
    getFinalScripts,
    isP2A,
    isP2MS,
    isP2PK,
    isP2PKH,
    isP2SHScript,
    isP2TR,
    isP2WPKH,
    isP2WSHScript,
    isUnknownSegwitVersion,
    Network,
    opcodes,
    P2TRPayment,
    payments,
    PaymentType,
    Psbt,
    PsbtInput,
    PsbtInputExtended,
    script,
    Signer,
    toXOnly,
    Transaction,
    varuint,
} from '@btc-vision/bitcoin';

import { TweakedSigner, TweakSettings } from '../../signer/TweakedSigner.js';
import { ECPairInterface } from 'ecpair';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { ChainId } from '../../network/ChainId.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';
import {
    canSignNonTaprootInput,
    isTaprootInput,
    pubkeyInScript,
} from '../../signer/SignerUtils.js';
import { TransactionBuilder } from '../builders/TransactionBuilder.js';

export type SupportedTransactionVersion = 1 | 2 | 3;

export interface ITweakedTransactionData {
    readonly signer: Signer | ECPairInterface | UnisatSigner;
    readonly network: Network;
    readonly chainId?: ChainId;
    readonly nonWitnessUtxo?: Buffer;
    readonly noSignatures?: boolean;
    readonly unlockScript?: Buffer[];
    readonly txVersion?: SupportedTransactionVersion;
}

/**
 * The transaction sequence
 */
export enum TransactionSequence {
    REPLACE_BY_FEE = 0xfffffffd,
    FINAL = 0xffffffff,
}

export enum CSVModes {
    BLOCKS = 0,
    TIMESTAMPS = 1,
}

const CSV_ENABLED_BLOCKS_MASK = 0x3fffffff;

/**
 * @description PSBT Transaction processor.
 * */
export abstract class TweakedTransaction extends Logger {
    public readonly logColor: string = '#00ffe1';
    public finalized: boolean = false;

    /**
     * @description Was the transaction signed?
     */
    protected signer: Signer | ECPairInterface | UnisatSigner;

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
    protected scriptData: P2TRPayment | null = null;

    /**
     * @description The tap data of the transaction
     */
    protected tapData: P2TRPayment | null = null;

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

    /**
     * Track which inputs contain CSV scripts
     * @protected
     */
    protected csvInputIndices: Set<number> = new Set();
    protected anchorInputIndices: Set<number> = new Set();

    protected regenerated: boolean = false;
    protected ignoreSignatureErrors: boolean = false;
    protected noSignatures: boolean = false;
    protected unlockScript: Buffer[] | undefined;

    protected txVersion: SupportedTransactionVersion = 2;

    protected constructor(data: ITweakedTransactionData) {
        super();

        this.signer = data.signer;
        this.network = data.network;

        this.noSignatures = data.noSignatures || false;
        this.nonWitnessUtxo = data.nonWitnessUtxo;
        this.unlockScript = data.unlockScript;

        this.isBrowser = typeof window !== 'undefined';

        if (data.txVersion) {
            this.txVersion = data.txVersion;
        }
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
            offset += varint.bytes;
            return varint.numberValue || 0;
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
            // This would disable CSV! You need to check if the input has CSV
            if (this.csvInputIndices.has(this.inputs.indexOf(input))) {
                continue;
            }

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

    protected generateTapData(): P2TRPayment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            name: PaymentType.P2TR,
        };
    }

    /**
     * Generates the script address.
     * @protected
     * @returns {Payment}
     */
    protected generateScriptAddress(): P2TRPayment {
        return {
            internalPubkey: this.internalPubKeyToXOnly(),
            network: this.network,
            name: PaymentType.P2TR,
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
     * @param {Signer} signer - The signer to use
     * @param {boolean} [reverse=false] - Should the input be signed in reverse
     * @param {boolean} [errored=false] - Was there an error
     * @protected
     */
    protected async signInput(
        transaction: Psbt,
        input: PsbtInput,
        i: number,
        signer: Signer | ECPairInterface,
        reverse: boolean = false,
        errored: boolean = false,
    ): Promise<void> {
        if (this.anchorInputIndices.has(i)) return;

        const publicKey = signer.publicKey;

        let isTaproot = isTaprootInput(input);
        if (reverse) {
            isTaproot = !isTaproot;
        }

        let signed: boolean = false;
        let didError: boolean = false;
        if (isTaproot) {
            try {
                await this.attemptSignTaproot(transaction, input, i, signer, publicKey);
                signed = true;
            } catch (e) {
                this.error(
                    `Failed to sign Taproot script path input ${i} (reverse: ${reverse}): ${(e as Error).message}`,
                );

                didError = true;
            }
        } else {
            // Non-Taproot input
            if (!reverse ? canSignNonTaprootInput(input, publicKey) : true) {
                try {
                    await this.signNonTaprootInput(signer, transaction, i);
                    signed = true;
                } catch (e) {
                    this.error(`Failed to sign non-Taproot input ${i}: ${(e as Error).stack}`);
                    didError = true;
                }
            }
        }

        if (!signed) {
            if (didError && errored) {
                throw new Error(`Failed to sign input ${i} with the provided signer.`);
            }

            try {
                await this.signInput(transaction, input, i, signer, true, didError);
            } catch {
                throw new Error(`Cannot sign input ${i} with the provided signer.`);
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
        if ('multiSignPsbt' in this.signer) {
            await this.signInputsWalletBased(transaction);
            return;
        }

        await this.signInputsNonWalletBased(transaction);
    }

    protected async signInputsNonWalletBased(transaction: Psbt): Promise<void> {
        // non web based signing.
        const txs: PsbtInput[] = transaction.data.inputs;

        const batchSize: number = 20;
        const batches = this.splitArray(txs, batchSize);

        if (!this.noSignatures) {
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const promises: Promise<void>[] = [];
                const offset = i * batchSize;

                for (let j = 0; j < batch.length; j++) {
                    const index = offset + j;
                    const input = batch[j];

                    try {
                        promises.push(this.signInput(transaction, input, index, this.signer));
                    } catch (e) {
                        this.log(`Failed to sign input ${index}: ${(e as Error).stack}`);
                    }
                }

                await Promise.all(promises);
            }
        }

        for (let i = 0; i < transaction.data.inputs.length; i++) {
            transaction.finalizeInput(i, this.customFinalizerP2SH.bind(this));
        }

        this.finalized = true;
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

    protected generateP2SHRedeemScript(customWitnessScript: Buffer): Buffer | undefined {
        const p2wsh = payments.p2wsh({
            redeem: { output: customWitnessScript },
            network: this.network,
        });

        // Step 2: Wrap the P2WSH inside a P2SH (Pay-to-Script-Hash)
        const p2sh = payments.p2sh({
            redeem: p2wsh,
            network: this.network,
        });

        return p2sh.output;
    }

    protected generateP2SHRedeemScriptLegacy(inputAddr: string):
        | {
              redeemScript: Buffer;
              outputScript: Buffer;
          }
        | undefined {
        const pubKeyHash = bitCrypto.hash160(this.signer.publicKey);
        const redeemScript: Buffer = script.compile([
            opcodes.OP_DUP,
            opcodes.OP_HASH160,
            pubKeyHash,
            opcodes.OP_EQUALVERIFY,
            opcodes.OP_CHECKSIG,
        ]);

        const redeemScriptHash = bitCrypto.hash160(redeemScript);
        const outputScript = script.compile([
            opcodes.OP_HASH160,
            redeemScriptHash,
            opcodes.OP_EQUAL,
        ]);

        const p2wsh = payments.p2wsh({
            redeem: { output: redeemScript }, // Use the custom redeem script
            network: this.network,
        });

        // Step 3: Wrap the P2WSH in a P2SH
        const p2sh = payments.p2sh({
            redeem: p2wsh, // The P2WSH is wrapped inside the P2SH
            network: this.network,
        });

        const address = bitAddress.fromOutputScript(outputScript, this.network);
        if (address === inputAddr && p2sh.redeem && p2sh.redeem.output) {
            return {
                redeemScript,
                outputScript: p2sh.redeem.output,
            };
        }

        return;
    }

    protected generateP2SHP2PKHRedeemScript(inputAddr: string):
        | {
              redeemScript: Buffer;
              outputScript: Buffer;
          }
        | undefined {
        const pubkey = Buffer.isBuffer(this.signer.publicKey)
            ? this.signer.publicKey
            : Buffer.from(this.signer.publicKey, 'hex');

        const w = payments.p2wpkh({
            pubkey: pubkey,
            network: this.network,
        });

        const p = payments.p2sh({
            redeem: w,
            network: this.network,
        });

        const address = p.address;
        const redeemScript = p.redeem?.output;
        if (!redeemScript) {
            throw new Error('Failed to generate P2SH-P2WPKH redeem script');
        }

        if (address === inputAddr && p.redeem && p.redeem.output && p.output) {
            return {
                redeemScript: p.redeem.output,
                outputScript: p.output,
            };
        }

        return;
    }

    /**
     * Generate the PSBT input extended, supporting various script types
     * @param {UTXO} utxo The UTXO
     * @param {number} i The index of the input
     * @param {UTXO} _extra Extra UTXO
     * @protected
     * @returns {PsbtInputExtended} The PSBT input extended
     */
    protected generatePsbtInputExtended(
        utxo: UTXO,
        i: number,
        _extra: boolean = false,
    ): PsbtInputExtended {
        const scriptPub = Buffer.from(utxo.scriptPubKey.hex, 'hex');

        const input: PsbtInputExtended = {
            hash: utxo.transactionId,
            index: utxo.outputIndex,
            sequence: this.sequence,
            witnessUtxo: {
                value: Number(utxo.value),
                script: scriptPub,
            },
        };

        // Handle P2PKH (Legacy)
        if (isP2PKH(scriptPub)) {
            // Legacy input requires nonWitnessUtxo
            if (utxo.nonWitnessUtxo) {
                //delete input.witnessUtxo;
                input.nonWitnessUtxo = Buffer.isBuffer(utxo.nonWitnessUtxo)
                    ? utxo.nonWitnessUtxo
                    : Buffer.from(utxo.nonWitnessUtxo, 'hex');
            } else {
                throw new Error('Missing nonWitnessUtxo for P2PKH UTXO');
            }
        }

        // Handle P2WPKH (SegWit)
        else if (isP2WPKH(scriptPub) || isUnknownSegwitVersion(scriptPub)) {
            // No redeemScript required for pure P2WPKH
            // witnessUtxo is enough, no nonWitnessUtxo needed.
        }

        // Handle P2WSH (SegWit)
        else if (isP2WSHScript(scriptPub)) {
            this.processP2WSHInput(utxo, input, i);
        }

        // Handle P2SH (Can be legacy or wrapping segwit)
        else if (isP2SHScript(scriptPub)) {
            // Redeem script is required for P2SH
            let redeemScriptBuf: Buffer | undefined;

            if (utxo.redeemScript) {
                redeemScriptBuf = Buffer.isBuffer(utxo.redeemScript)
                    ? utxo.redeemScript
                    : Buffer.from(utxo.redeemScript, 'hex');
            } else {
                // Attempt to generate a redeem script if missing
                if (!utxo.scriptPubKey.address) {
                    throw new Error(
                        'Missing redeemScript and no address to regenerate it for P2SH UTXO',
                    );
                }

                const legacyScripts = this.generateP2SHP2PKHRedeemScript(utxo.scriptPubKey.address);
                if (!legacyScripts) {
                    throw new Error('Missing redeemScript for P2SH UTXO and unable to regenerate');
                }

                redeemScriptBuf = legacyScripts.redeemScript;
            }

            input.redeemScript = redeemScriptBuf;

            // Check if redeemScript is wrapping segwit (like P2SH-P2WPKH or P2SH-P2WSH)
            const payment = payments.p2sh({ redeem: { output: input.redeemScript } });
            if (!payment.redeem) {
                throw new Error('Failed to extract redeem script from P2SH UTXO');
            }

            const redeemOutput = payment.redeem.output;
            if (!redeemOutput) {
                throw new Error('Failed to extract redeem output from P2SH UTXO');
            }

            if (utxo.nonWitnessUtxo) {
                input.nonWitnessUtxo = Buffer.isBuffer(utxo.nonWitnessUtxo)
                    ? utxo.nonWitnessUtxo
                    : Buffer.from(utxo.nonWitnessUtxo, 'hex');
            }

            if (isP2WPKH(redeemOutput)) {
                // P2SH-P2WPKH
                // Use witnessUtxo + redeemScript
                delete input.nonWitnessUtxo; // ensure we do NOT have nonWitnessUtxo
                // witnessScript is not needed
            } else if (isP2WSHScript(redeemOutput)) {
                // P2SH-P2WSH
                // Use witnessUtxo + redeemScript + witnessScript
                delete input.nonWitnessUtxo; // ensure we do NOT have nonWitnessUtxo

                this.processP2WSHInput(utxo, input, i);
            } else {
                // Legacy P2SH
                // Use nonWitnessUtxo
                delete input.witnessUtxo; // ensure we do NOT have witnessUtxo
            }
        }

        // Handle P2TR (Taproot)
        else if (isP2TR(scriptPub)) {
            // Taproot inputs do not require nonWitnessUtxo, witnessUtxo is sufficient.

            // If there's a configured sighash type
            if (this.sighashTypes) {
                const inputSign = TweakedTransaction.calculateSignHash(this.sighashTypes);
                if (inputSign) input.sighashType = inputSign;
            }

            // Taproot internal key
            this.tweakSigner();
            input.tapInternalKey = this.internalPubKeyToXOnly();
        }

        // Handle P2A (Any SegWit version, future versions)
        else if (isP2A(scriptPub)) {
            this.anchorInputIndices.add(i);

            input.isPayToAnchor = true;
        }

        // Handle P2PK (legacy) or P2MS (bare multisig)
        else if (isP2PK(scriptPub) || isP2MS(scriptPub)) {
            // These are legacy scripts, need nonWitnessUtxo
            if (utxo.nonWitnessUtxo) {
                input.nonWitnessUtxo = Buffer.isBuffer(utxo.nonWitnessUtxo)
                    ? utxo.nonWitnessUtxo
                    : Buffer.from(utxo.nonWitnessUtxo, 'hex');
            } else {
                throw new Error('Missing nonWitnessUtxo for P2PK or P2MS UTXO');
            }
        } else {
            this.error(`Unknown or unsupported script type for output: ${utxo.scriptPubKey.hex}`);
        }

        if (i === 0) {
            // TapLeafScript if available
            if (this.tapLeafScript) {
                input.tapLeafScript = [this.tapLeafScript];
            }

            if (this.nonWitnessUtxo) {
                input.nonWitnessUtxo = this.nonWitnessUtxo;
            }
        }

        /*if (utxo.nonWitnessUtxo && extra) {
            const witness = Buffer.isBuffer(utxo.nonWitnessUtxo)
                ? utxo.nonWitnessUtxo
                : typeof utxo.nonWitnessUtxo === 'string'
                  ? Buffer.from(utxo.nonWitnessUtxo, 'hex')
                  : (utxo.nonWitnessUtxo as unknown) instanceof Uint8Array
                    ? Buffer.from(utxo.nonWitnessUtxo)
                    : undefined;

            input.nonWitnessUtxo = witness;
        }*/

        return input;
    }

    protected processP2WSHInput(utxo: UTXO, input: PsbtInputExtended, i: number): void {
        // P2WSH requires a witnessScript
        if (!utxo.witnessScript) {
            // Can't just invent a witnessScript out of thin air. If not provided, it's an error.
            throw new Error('Missing witnessScript for P2WSH UTXO');
        }

        input.witnessScript = Buffer.isBuffer(utxo.witnessScript)
            ? utxo.witnessScript
            : Buffer.from(utxo.witnessScript, 'hex');

        // No nonWitnessUtxo needed for segwit

        const decompiled = script.decompile(input.witnessScript);
        if (decompiled && this.isCSVScript(decompiled)) {
            const decompiled = script.decompile(input.witnessScript);
            if (decompiled && this.isCSVScript(decompiled)) {
                this.csvInputIndices.add(i);

                // Extract CSV value from witness script
                const csvBlocks = this.extractCSVBlocks(decompiled);

                console.log('csvBlocks', csvBlocks);

                // Use the setCSVSequence method to properly set the sequence
                input.sequence = this.setCSVSequence(csvBlocks, this.sequence);
            }
        }
    }

    protected secondsToCSVTimeUnits(seconds: number): number {
        return Math.floor(seconds / 512);
    }

    protected createTimeBasedCSV(seconds: number): number {
        const timeUnits = this.secondsToCSVTimeUnits(seconds);
        if (timeUnits > 0xffff) {
            throw new Error(`Time units ${timeUnits} exceeds maximum of 65,535`);
        }
        return timeUnits | (1 << 22);
    }

    protected isCSVEnabled(sequence: number): boolean {
        return (sequence & (1 << 31)) === 0;
    }

    protected extractCSVValue(sequence: number): number {
        return sequence & 0x0000ffff;
    }

    protected customFinalizerP2SH = (
        inputIndex: number,
        input: PsbtInput,
        scriptA: Buffer,
        isSegwit: boolean,
        isP2SH: boolean,
        isP2WSH: boolean,
    ): {
        finalScriptSig: Buffer | undefined;
        finalScriptWitness: Buffer | undefined;
    } => {
        const inputDecoded = this.inputs[inputIndex];
        if (isP2SH && input.partialSig && inputDecoded && inputDecoded.redeemScript) {
            const signatures = input.partialSig.map((sig) => sig.signature) || [];
            const scriptSig = script.compile([...signatures, inputDecoded.redeemScript]);

            return {
                finalScriptSig: scriptSig,
                finalScriptWitness: undefined,
            };
        }

        if (this.anchorInputIndices.has(inputIndex)) {
            console.log('Finalizing anchor input at index', inputIndex);
            return {
                finalScriptSig: undefined,
                finalScriptWitness: Buffer.from([0]),
            };
        }

        if (isP2WSH && isSegwit && input.witnessScript) {
            if (!input.partialSig || input.partialSig.length === 0) {
                throw new Error(`No signatures for P2WSH input #${inputIndex}`);
            }

            // Check if this is a CSV input
            const isCSVInput = this.csvInputIndices.has(inputIndex);
            if (isCSVInput) {
                // For CSV P2WSH, the witness stack should be: [signature, witnessScript]
                const witnessStack = [input.partialSig[0].signature, input.witnessScript];
                return {
                    finalScriptSig: undefined,
                    finalScriptWitness:
                        TransactionBuilder.witnessStackToScriptWitness(witnessStack),
                };
            }

            // For non-CSV P2WSH, use default finalization
        }

        return getFinalScripts(
            inputIndex,
            input,
            scriptA,
            isSegwit,
            isP2SH,
            isP2WSH,
            true,
            this.unlockScript,
        );
    };

    protected async signInputsWalletBased(transaction: Psbt): Promise<void> {
        const signer: UnisatSigner = this.signer as UnisatSigner;

        // then, we sign all the remaining inputs with the wallet signer.
        await signer.multiSignPsbt([transaction]);

        // Then, we finalize every input.
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            transaction.finalizeInput(i, this.customFinalizerP2SH.bind(this));
        }

        this.finalized = true;
    }

    protected isCSVScript(decompiled: (number | Buffer)[]): boolean {
        return decompiled.some((op) => op === opcodes.OP_CHECKSEQUENCEVERIFY);
    }

    protected setCSVSequence(csvBlocks: number, currentSequence: number): number {
        if (this.txVersion < 2) {
            throw new Error('CSV requires transaction version 2 or higher');
        }

        if (csvBlocks > 0xffff) {
            throw new Error(`CSV blocks ${csvBlocks} exceeds maximum of 65,535`);
        }

        // Layout of nSequence field (32 bits) when CSV is active (bit 31 = 0):
        // Bit 31: Must be 0 (CSV enable flag)
        // Bits 23-30: Unused by BIP68 (available for custom use)
        // Bit 22: Time flag (0 = blocks, 1 = time)
        // Bits 16-21: Unused by BIP68 (available for custom use)
        // Bits 0-15: CSV lock-time value

        // Extract the time flag if it's set in csvBlocks
        const isTimeBased = (csvBlocks & (1 << 22)) !== 0;

        // Start with the CSV value
        let sequence = csvBlocks & 0x0000ffff;

        // Preserve the time flag if set
        if (isTimeBased) {
            sequence |= 1 << 22;
        }

        if (currentSequence === (TransactionSequence.REPLACE_BY_FEE as number)) {
            // Set bit 25 as our explicit RBF flag
            // This is in the unused range (bits 23-30) when CSV is active
            sequence |= 1 << 25;

            // We could use other unused bits for version/features
            // sequence |= (1 << 26); // Could indicate tx flags if we wanted
        }

        // Final safety check: ensure bit 31 is 0 (CSV enabled)
        sequence = sequence & 0x7fffffff;

        return sequence;
    }

    protected getCSVType(csvValue: number): CSVModes {
        // Bit 22 determines if it's time-based (1) or block-based (0)
        return csvValue & (1 << 22) ? CSVModes.TIMESTAMPS : CSVModes.BLOCKS;
    }

    private extractCSVBlocks(decompiled: (number | Buffer)[]): number {
        for (let i = 0; i < decompiled.length; i++) {
            if (decompiled[i] === opcodes.OP_CHECKSEQUENCEVERIFY && i > 0) {
                const csvValue = decompiled[i - 1];
                if (Buffer.isBuffer(csvValue)) {
                    return script.number.decode(csvValue);
                } else if (typeof csvValue === 'number') {
                    // Handle OP_N directly
                    if (csvValue === opcodes.OP_0 || csvValue === opcodes.OP_FALSE) {
                        return 0;
                    } else if (csvValue === opcodes.OP_1NEGATE) {
                        return -1;
                    } else if (csvValue >= opcodes.OP_1 && csvValue <= opcodes.OP_16) {
                        return csvValue - opcodes.OP_1 + 1;
                    } else {
                        // For other numbers, they should have been Buffers
                        // This shouldn't happen in properly decompiled scripts
                        throw new Error(`Unexpected raw number in script: ${csvValue}`);
                    }
                }
            }
        }
        return 0;
    }

    private async attemptSignTaproot(
        transaction: Psbt,
        input: PsbtInput,
        i: number,
        signer: Signer | ECPairInterface,
        publicKey: Buffer,
    ): Promise<void> {
        const isScriptSpend = this.isTaprootScriptSpend(input, publicKey);

        if (isScriptSpend) {
            await this.signTaprootInput(signer, transaction, i);
        } else {
            let tweakedSigner: ECPairInterface | undefined;
            if (signer !== this.signer) {
                tweakedSigner = this.getTweakedSigner(true, signer);
            } else {
                if (!this.tweakedSigner) this.tweakSigner();
                tweakedSigner = this.tweakedSigner;
            }

            if (tweakedSigner) {
                try {
                    await this.signTaprootInput(tweakedSigner, transaction, i);
                } catch (e) {
                    tweakedSigner = this.getTweakedSigner(false, this.signer);
                    if (!tweakedSigner) {
                        throw new Error(`Failed to obtain tweaked signer for input ${i}.`);
                    }

                    await this.signTaprootInput(tweakedSigner, transaction, i);
                }
            } else {
                this.error(`Failed to obtain tweaked signer for input ${i}.`);
            }
        }
    }

    private isTaprootScriptSpend(input: PsbtInput, publicKey: Buffer): boolean {
        if (input.tapLeafScript && input.tapLeafScript.length > 0) {
            // Check if the signer's public key is involved in any tapLeafScript
            for (const tapLeafScript of input.tapLeafScript) {
                if (pubkeyInScript(publicKey, tapLeafScript.script)) {
                    // The public key is in the script; it's a script spend
                    return true;
                }
            }
        }
        return false;
    }

    private async signTaprootInput(
        signer: Signer | ECPairInterface,
        transaction: Psbt,
        i: number,
        tapLeafHash?: Buffer,
    ): Promise<void> {
        if ('signTaprootInput' in signer) {
            try {
                await (
                    signer.signTaprootInput as (
                        tx: Psbt,
                        i: number,
                        tapLeafHash?: Buffer,
                    ) => Promise<void>
                )(transaction, i, tapLeafHash);
            } catch {
                throw new Error('Failed to sign Taproot input with provided signer.');
            }
        } else {
            transaction.signTaprootInput(i, signer); //tapLeafHash
        }
    }

    private async signNonTaprootInput(
        signer: Signer | ECPairInterface,
        transaction: Psbt,
        i: number,
    ): Promise<void> {
        if ('signInput' in signer) {
            await (signer.signInput as (tx: Psbt, i: number) => Promise<void>)(transaction, i);
        } else {
            transaction.signInput(i, signer);
        }
    }
}
