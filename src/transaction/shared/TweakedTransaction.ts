import { Logger } from '@btc-vision/logger';
import {
    address as bitAddress,
    crypto as bitCrypto,
    getFinalScripts,
    Network,
    opcodes,
    Payment,
    payments,
    Psbt,
    PsbtInput,
    PsbtInputExtended,
    script,
    Signer,
    Transaction,
} from '@btc-vision/bitcoin';

import { TweakedSigner, TweakSettings } from '../../signer/TweakedSigner.js';
import { ECPairInterface } from 'ecpair';
import { toXOnly } from '@btc-vision/bitcoin/src/psbt/bip371.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { ChainId } from '../../network/ChainId.js';
import { varuint } from '@btc-vision/bitcoin/src/bufferutils.js';
import { UnisatSigner } from '../browser/extensions/UnisatSigner.js';
import {
    canSignNonTaprootInput,
    isTaprootInput,
    pubkeyInScript,
} from '../../signer/SignerUtils.js';
import {
    isP2MS,
    isP2PK,
    isP2PKH,
    isP2SHScript,
    isP2TR,
    isP2WPKH,
    isP2WSHScript,
} from '@btc-vision/bitcoin/src/psbt/psbtutils.js';

export interface ITweakedTransactionData {
    readonly signer: Signer | ECPairInterface | UnisatSigner;
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

        // non web based signing.
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
                    promises.push(this.signInput(transaction, input, index, this.signer));
                } catch (e) {
                    this.log(`Failed to sign input ${index}: ${(e as Error).stack}`);
                }
            }

            await Promise.all(promises);
        }

        for (let i = 0; i < transaction.data.inputs.length; i++) {
            transaction.finalizeInput(i, this.customFinalizerP2SH);
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
     * @protected
     * @returns {PsbtInputExtended} The PSBT input extended
     */
    protected generatePsbtInputExtended(utxo: UTXO, i: number): PsbtInputExtended {
        const script = Buffer.from(utxo.scriptPubKey.hex, 'hex');

        const input: PsbtInputExtended = {
            hash: utxo.transactionId,
            index: utxo.outputIndex,
            sequence: this.sequence,
            witnessUtxo: {
                value: Number(utxo.value),
                script,
            },
        };

        // Handle P2PKH (Legacy)
        if (isP2PKH(script)) {
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
        else if (isP2WPKH(script)) {
            // No redeemScript required for pure P2WPKH
            // witnessUtxo is enough, no nonWitnessUtxo needed.
        }

        // Handle P2WSH (SegWit)
        else if (isP2WSHScript(script)) {
            // P2WSH requires a witnessScript
            if (!utxo.witnessScript) {
                // Can't just invent a witnessScript out of thin air. If not provided, it's an error.
                throw new Error('Missing witnessScript for P2WSH UTXO');
            }

            input.witnessScript = Buffer.isBuffer(utxo.witnessScript)
                ? utxo.witnessScript
                : Buffer.from(utxo.witnessScript, 'hex');

            // No nonWitnessUtxo needed for segwit
        }

        // Handle P2SH (Can be legacy or wrapping segwit)
        else if (isP2SHScript(script)) {
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
                if (!input.witnessScript) {
                    throw new Error('Missing witnessScript for P2SH-P2WSH UTXO');
                }
            } else {
                // Legacy P2SH
                // Use nonWitnessUtxo
                delete input.witnessUtxo; // ensure we do NOT have witnessUtxo
            }
        }

        // Handle P2TR (Taproot)
        else if (isP2TR(script)) {
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

        // Handle P2PK (legacy) or P2MS (bare multisig)
        else if (isP2PK(script) || isP2MS(script)) {
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

        // TapLeafScript if available
        if (this.tapLeafScript) {
            input.tapLeafScript = [this.tapLeafScript];
        }

        // If the first input and we have a global nonWitnessUtxo not yet set
        if (i === 0 && this.nonWitnessUtxo) {
            input.nonWitnessUtxo = this.nonWitnessUtxo;
        }

        return input;
    }

    /*protected generatePsbtInputExtended(utxo: UTXO, i: number): PsbtInputExtended {
        const input: PsbtInputExtended = {
            hash: utxo.transactionId,
            index: utxo.outputIndex,
            sequence: this.sequence,
            witnessUtxo: {
                value: Number(utxo.value),
                script: Buffer.from(utxo.scriptPubKey.hex, 'hex'),
            },
        };

        if (utxo.scriptPubKey.address) {
            // auto detect for potential p2sh utxos
            try {
                const addressType: AddressTypes | null = AddressVerificator.detectAddressType(
                    utxo.scriptPubKey.address,
                    this.network,
                );

                if (addressType === AddressTypes.P2SH_OR_P2SH_P2WPKH) {
                    // We can automatically reconstruct the redeem script.
                    const redeemScript = this.generateP2SHRedeemScriptLegacy(
                        utxo.scriptPubKey.address,
                    );

                    if (!redeemScript) {
                        throw new Error('Failed to generate redeem script');
                    }

                    input.redeemScript = redeemScript.outputScript;
                    input.witnessScript = redeemScript.redeemScript;
                }
            } catch (e) {
                this.error(`Failed to detect address type for ${utxo.scriptPubKey.address} - ${e}`);
            }
        }

        // LEGACY P2SH SUPPORT
        if (utxo.nonWitnessUtxo) {
            input.nonWitnessUtxo = Buffer.isBuffer(utxo.nonWitnessUtxo)
                ? utxo.nonWitnessUtxo
                : Buffer.from(utxo.nonWitnessUtxo, 'hex');
        }

        // SEGWIT SUPPORT
        if (utxo.redeemScript) {
            input.redeemScript = Buffer.isBuffer(utxo.redeemScript)
                ? utxo.redeemScript
                : Buffer.from(utxo.redeemScript, 'hex');

            if (utxo.witnessScript) {
                input.witnessScript = Buffer.isBuffer(utxo.witnessScript)
                    ? utxo.witnessScript
                    : Buffer.from(utxo.witnessScript, 'hex');
            }
        }

        // TAPROOT.
        if (this.sighashTypes) {
            const inputSign = TweakedTransaction.calculateSignHash(this.sighashTypes);
            if (inputSign) input.sighashType = inputSign;
        }

        if (i === 0 && this.nonWitnessUtxo) {
            input.nonWitnessUtxo = this.nonWitnessUtxo;
        }

        // Automatically detect P2TR inputs.
        if (
            utxo.scriptPubKey.address &&
            AddressVerificator.isValidP2TRAddress(utxo.scriptPubKey.address, this.network)
        ) {
            this.tweakSigner();

            input.tapInternalKey = this.internalPubKeyToXOnly();
        }

        console.log(input);

        return input;
    }*/

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
            const signatures = input.partialSig.map((sig) => sig.signature);
            const scriptSig = script.compile([...signatures, inputDecoded.redeemScript]);

            return {
                finalScriptSig: scriptSig,
                finalScriptWitness: undefined,
            };
        }

        return getFinalScripts(inputIndex, input, scriptA, isSegwit, isP2SH, isP2WSH);
    };

    protected async signInputsWalletBased(transaction: Psbt): Promise<void> {
        const signer: UnisatSigner = this.signer as UnisatSigner;

        // then, we sign all the remaining inputs with the wallet signer.
        await signer.multiSignPsbt([transaction]);

        // Then, we finalize every input.
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            transaction.finalizeInput(i, this.customFinalizerP2SH);
        }

        this.finalized = true;
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
                await this.signTaprootInput(tweakedSigner, transaction, i);
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
