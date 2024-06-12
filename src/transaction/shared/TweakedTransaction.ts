import { Logger } from '@btc-vision/logger';
import { Network, Payment, payments, Psbt, Signer, Transaction } from 'bitcoinjs-lib';
import { TweakedSigner, TweakSettings } from '../../signer/TweakedSigner.js';
import { ECPairInterface } from 'ecpair';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { PsbtInput } from 'bip174/src/lib/interfaces.js';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { PsbtInputExtended, TapLeafScript } from '../interfaces/Tap.js';
import { AddressVerificator } from '../../keypair/AddressVerificator.js';

export interface ITweakedTransactionData {
    readonly signer: Signer;
    readonly network: Network;
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

    /**
     * @description Was the transaction signed?
     */
    protected signer: Signer;

    /**
     * @description Tweaked signer
     */
    protected tweakedSigner?: Signer;

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
    protected readonly sighashTypes: number[] | undefined;

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

    protected constructor(data: ITweakedTransactionData) {
        super();

        this.signer = data.signer;
        this.network = data.network;

        this.nonWitnessUtxo = data.nonWitnessUtxo;
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
     * Get the transaction PSBT as a base64 string.
     * @public
     * @returns {string} - The transaction as a base64 string
     */
    public toBase64(): string {
        return this.transaction.toBase64();
    }

    /**
     * @description Disables replace by fee on the transaction
     */
    public disableRBF(): void {
        if (this.signed) throw new Error('Transaction is already signed');

        this.sequence = TransactionSequence.FINAL;

        for (let input of this.inputs) {
            input.sequence = TransactionSequence.FINAL;
        }
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
     * @returns {Signer}
     */
    protected getSignerKey(): Signer {
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
    protected signInput(transaction: Psbt, input: PsbtInput, i: number, signer?: Signer): void {
        const signHash = this.sighashTypes ? [this.calculateSignHash()] : undefined;
        
        if (input.tapInternalKey) {
            if (!this.tweakedSigner) throw new Error('Tweaked signer is required');
            transaction.signTaprootInput(i, this.tweakedSigner, undefined, signHash);
        } else {
            transaction.signInput(i, signer || this.getSignerKey(), signHash);
        }
    }

    /**
     * Signs all the inputs of the transaction.
     * @param {Psbt} transaction - The transaction to sign
     * @protected
     * @returns {void}
     */
    protected signInputs(transaction: Psbt): void {
        for (let i = 0; i < transaction.data.inputs.length; i++) {
            let input: PsbtInput = transaction.data.inputs[i];

            this.signInput(transaction, input, i);
        }

        transaction.finalizeAllInputs();
    }

    /**
     * Calculate the sign hash number
     * @description Calculates the sign hash
     * @protected
     * @returns {number}
     */
    protected calculateSignHash(): number {
        if (!this.sighashTypes) {
            throw new Error('Sighash types are required');
        }

        let signHash: number = 0;
        for (let sighashType of this.sighashTypes) {
            signHash |= sighashType;
        }

        return signHash;
    }

    /**
     * Converts the public key to x-only.
     * @protected
     * @returns {Buffer}
     */
    protected internalPubKeyToXOnly(): Buffer {
        return toXOnly(this.signer.publicKey);
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
     * @param {boolean} useTweakedHash Whether to use the tweaked hash
     * @private
     *
     * @returns {Signer} The tweaked signer
     */
    protected getTweakedSigner(useTweakedHash: boolean = false): Signer {
        const settings: TweakSettings = {
            network: this.network,
        };

        if (useTweakedHash) {
            settings.tweakHash = this.getTweakerHash();
        }

        return TweakedSigner.tweakSigner(this.signer as ECPairInterface, settings);
    }

    /**
     * Get the tweaked hash
     * @private
     *
     * @returns {Buffer | undefined} The tweaked hash
     */
    protected getTweakerHash(): Buffer | undefined {
        return this.tapData?.hash;
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
            input.sighashType = this.calculateSignHash();
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