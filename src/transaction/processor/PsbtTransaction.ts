import {
    Network,
    Psbt,
    PsbtInputExtended,
    PsbtOutputExtended,
    Signer,
    Transaction,
} from '@btc-vision/bitcoin';
import { ITweakedTransactionData, TweakedTransaction } from '../shared/TweakedTransaction.js';

export interface PsbtTransactionData extends ITweakedTransactionData {
    readonly psbt: Psbt;
    readonly signer: Signer;
    readonly network: Network;
}

/*export interface IWBTCUTXODocument {
    readonly vault: string;
    readonly blockId: bigint;

    readonly hash: string;
    readonly value: bigint;
    readonly outputIndex: number;

    readonly output: string;
}

export interface VaultUTXOs {
    readonly vault: string;
    readonly publicKeys: string[];
    readonly minimum: number;
    readonly utxos: IWBTCUTXODocument[];
}*/

export type FromBase64Params = Omit<PsbtTransactionData, 'psbt'>;

/**
 * @description PSBT Transaction processor.
 * */
export class PsbtTransaction extends TweakedTransaction {
    public readonly logColor: string = '#00ffe1';

    public feesAddition: bigint = 10000n; // add 80000 satoshis to the fees

    /**
     * @description The transaction
     * @protected
     */
    protected readonly transaction: Psbt;

    /**
     * @description Sign hash types
     * @protected
     */
    protected readonly sighashTypes: number[] | undefined = [];

    constructor(data: PsbtTransactionData) {
        super(data);

        this.signer = data.signer;
        this.network = data.network;

        this.transaction = data.psbt;

        this.ignoreSignatureError();

        this.tweakSigner();
        this.internalInit();
    }

    public static fromBase64(data: string, params: FromBase64Params): PsbtTransaction {
        const psbt = Psbt.fromBase64(data, {
            network: params.network,
        });

        return new PsbtTransaction({
            ...params,
            psbt,
        });
    }

    public static fromHex(data: string, params: FromBase64Params): PsbtTransaction {
        const psbt = Psbt.fromHex(data, {
            network: params.network,
        });

        return new PsbtTransaction({
            ...params,
            psbt,
        });
    }

    public static from(params: FromBase64Params): PsbtTransaction {
        const psbt = new Psbt({ network: params.network });

        return new PsbtTransaction({
            ...params,
            psbt,
        });
    }

    /**
     * @description Extract the transaction
     */
    public extractTransaction(): Transaction {
        return this.transaction.extractTransaction();
    }

    /**
     * Final tx hex string.
     */
    public final(): string {
        return this.extractTransaction().toHex();
    }

    /**
     * Get the psbt as a hex string
     */
    public toHex(): string {
        return this.transaction.toHex();
    }

    /**
     * @description Add an input to the transaction
     * @param input
     * @param checkPartialSigs
     */
    public addInput(input: PsbtInputExtended, checkPartialSigs: boolean = false): void {
        this.transaction.addInput(input, checkPartialSigs);
    }

    /**
     * @description Add an output to the transaction
     * @param output
     */
    public addOutput(output: PsbtOutputExtended): void {
        if (!output.value) return;

        this.transaction.addOutput(output);
    }

    /**
     * Attempt to finalize all inputs
     * @returns {boolean} True if all inputs were finalized
     */
    public attemptFinalizeInputs(n: number = 1): boolean {
        try {
            const inputs = this.transaction.data.inputs;
            for (let i = n; i < inputs.length; i++) {
                const input = inputs[i];
                if (input.finalScriptWitness) {
                    this.transaction.finalizeTaprootInput(i, input.finalScriptWitness);
                } else {
                    this.transaction.finalizeInput(i);
                }
            }

            return true;
        } catch (e) {
            this.warn((e as Error).stack || "Couldn't finalize inputs");
            return false;
        }
    }

    public getPSBT(): Psbt {
        return this.transaction;
    }

    /*private getTotalOutputAmount(vaults: VaultUTXOs[]): bigint {
        let total = BigInt(0);
        for (const vault of vaults) {
            for (const utxo of vault.utxos) {
                total += BigInt(utxo.value);
            }
        }

        return total;
    }*/
}
