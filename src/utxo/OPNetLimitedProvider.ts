import type { Network } from '@btc-vision/bitcoin';
import type { IFundingTransactionParameters } from '../transaction/interfaces/ITransactionParameters.js';
import { TransactionFactory } from '../transaction/TransactionFactory.js';
import { Wallet } from '../keypair/Wallet.js';
import type { BroadcastResponse } from './interfaces/BroadcastResponse.js';
import type {
    FetchUTXOParams,
    FetchUTXOParamsMultiAddress,
    RawUTXOResponse,
    UTXO,
} from './interfaces/IUTXO.js';

export interface WalletUTXOs {
    readonly confirmed: RawUTXOResponse[];
    readonly pending: RawUTXOResponse[];
    readonly spentTransactions: RawUTXOResponse[];
    readonly raw: string[];
}

/**
 * Allows to fetch UTXO data from any OPNET node
 */
export class OPNetLimitedProvider {
    private readonly utxoPath: string = 'address/utxos';
    private readonly rpc: string = 'json-rpc';

    public constructor(private readonly opnetAPIUrl: string) {}

    /**
     * Fetches UTXO data from the OPNET node
     * @param {FetchUTXOParams} settings - The settings to fetch UTXO data
     * @returns {Promise<UTXO[]>} - The UTXOs fetched
     * @throws {Error} - If UTXOs could not be fetched
     */
    public async fetchUTXO(settings: FetchUTXOParams): Promise<UTXO[]> {
        if (settings.usePendingUTXO === undefined) {
            settings.usePendingUTXO = true;
        }

        if (settings.optimized === undefined) {
            settings.optimized = true;
        }

        const params = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const url: string = `${this.opnetAPIUrl}/api/v1/${this.utxoPath}?address=${settings.address}&optimize=${settings.optimized ?? false}`;
        const resp: Response = await fetch(url, params);

        if (!resp.ok) {
            throw new Error(`Failed to fetch UTXO data: ${resp.statusText}`);
        }

        const fetchedData: WalletUTXOs = (await resp.json()) as WalletUTXOs;
        const rawTransactions = fetchedData.raw ?? [];

        const allUtxos = settings.usePendingUTXO
            ? [...fetchedData.confirmed, ...fetchedData.pending]
            : fetchedData.confirmed;

        const unspentUTXOs: RawUTXOResponse[] = [];
        for (const utxo of allUtxos) {
            if (
                fetchedData.spentTransactions.some(
                    (spent) =>
                        spent.transactionId === utxo.transactionId &&
                        spent.outputIndex === utxo.outputIndex,
                )
            ) {
                continue;
            }

            unspentUTXOs.push(utxo);
        }

        if (unspentUTXOs.length === 0) {
            throw new Error('No UTXO found');
        }

        const meetCriteria: RawUTXOResponse[] = unspentUTXOs.filter((utxo: RawUTXOResponse) => {
            return BigInt(utxo.value) >= settings.minAmount;
        });

        if (meetCriteria.length === 0) {
            throw new Error('No UTXO found (minAmount)');
        }

        const finalUTXOs: UTXO[] = [];
        let currentAmount: bigint = 0n;

        const amountRequested: bigint = settings.requestedAmount;
        for (const utxo of meetCriteria) {
            const utxoValue: bigint = BigInt(utxo.value);

            if (utxoValue <= 0n) {
                continue;
            }

            const rawIndex = Number(utxo.raw);
            if (rawIndex === undefined || rawIndex === null) {
                throw new Error(
                    `Missing raw index for UTXO ${utxo.transactionId}:${utxo.outputIndex}`,
                );
            }

            const rawHex = rawTransactions[rawIndex];
            if (!rawHex) {
                throw new Error(
                    `Invalid raw index ${rawIndex} - not found in raw transactions array`,
                );
            }

            currentAmount += utxoValue;
            finalUTXOs.push({
                transactionId: utxo.transactionId,
                outputIndex: utxo.outputIndex,
                value: utxoValue,
                scriptPubKey: utxo.scriptPubKey,
                nonWitnessUtxo: Buffer.from(rawHex, 'base64'),
            });

            if (currentAmount > amountRequested) {
                break;
            }
        }

        return finalUTXOs;
    }

    /**
     * Fetches UTXO data from the OPNET node for multiple addresses
     * @param {FetchUTXOParamsMultiAddress} settings - The settings to fetch UTXO data
     * @returns {Promise<UTXO[]>} - The UTXOs fetched
     * @throws {Error} - If UTXOs could not be fetched
     */
    public async fetchUTXOMultiAddr(settings: FetchUTXOParamsMultiAddress): Promise<UTXO[]> {
        const promises: Promise<UTXO[]>[] = [];

        for (const address of settings.addresses) {
            const params: FetchUTXOParams = {
                address: address,
                minAmount: settings.minAmount,
                requestedAmount: settings.requestedAmount,
                optimized: settings.optimized,
                usePendingUTXO: settings.usePendingUTXO,
            };

            const promise = this.fetchUTXO(params).catch(() => {
                return [];
            });

            promises.push(promise);
        }

        const utxos: UTXO[][] = await Promise.all(promises);
        const all = utxos.flat();

        const finalUTXOs: UTXO[] = [];
        let currentAmount = 0n;
        for (let i = 0; i < all.length; i++) {
            const utxo = all[i];

            if (currentAmount >= settings.requestedAmount) {
                break;
            }

            currentAmount += (utxo as UTXO).value;
            finalUTXOs.push(utxo as UTXO);
        }

        return finalUTXOs;
    }

    /**
     * Broadcasts a transaction to the OPNET node
     * @param {string} transaction - The transaction to broadcast
     * @param {boolean} psbt - Whether the transaction is a PSBT
     * @returns {Promise<BroadcastResponse>} - The response from the OPNET node
     */
    public async broadcastTransaction(
        transaction: string,
        psbt: boolean,
    ): Promise<BroadcastResponse | undefined> {
        const params = [transaction, psbt];
        const result = await this.rpcMethod('btc_sendRawTransaction', params);

        if (!result) {
            return;
        }

        return result as BroadcastResponse;
    }

    /**
     * Splits UTXOs into smaller UTXOs
     * @param {Wallet} wallet - The wallet to split UTXOs
     * @param {Network} network - The network to split UTXOs
     * @param {number} splitInputsInto - The number of UTXOs to split into
     * @param {bigint} amountPerUTXO - The amount per UTXO
     * @returns {Promise<BroadcastResponse | { error: string }>} - The response from the OPNET node or an error
     */
    public async splitUTXOs(
        wallet: Wallet,
        network: Network,
        splitInputsInto: number,
        amountPerUTXO: bigint,
    ): Promise<BroadcastResponse | { error: string }> {
        const utxoSetting: FetchUTXOParamsMultiAddress = {
            addresses: [wallet.p2wpkh, wallet.p2tr],
            minAmount: 330n,
            requestedAmount: 1_000_000_000_000_000n,
        };

        const utxos: UTXO[] = await this.fetchUTXOMultiAddr(utxoSetting);
        if (!utxos || !utxos.length) return { error: 'No UTXOs found' };

        const amount = BigInt(splitInputsInto) * amountPerUTXO;

        const fundingTransactionParameters: IFundingTransactionParameters = {
            amount: amount,
            feeRate: 500,
            from: wallet.p2tr,
            utxos: utxos,
            signer: wallet.keypair,
            network,
            to: wallet.p2tr,
            splitInputsInto,
            priorityFee: 0n,
            gasSatFee: 330n,
            mldsaSigner: null,
        };

        const transactionFactory = new TransactionFactory();
        const fundingTx = await transactionFactory.createBTCTransfer(fundingTransactionParameters);

        const broadcastResponse = await this.broadcastTransaction(fundingTx.tx, false);
        if (!broadcastResponse) return { error: 'Could not broadcast transaction' };

        return broadcastResponse;
    }

    /**
     * Fetches to the OPNET node
     * @param {string} method
     * @param {unknown[]} paramsMethod
     * @returns {Promise<unknown>}
     */
    public async rpcMethod(method: string, paramsMethod: unknown[]): Promise<unknown> {
        const params = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: method,
                params: paramsMethod,
                id: 1,
            }),
        };

        const url: string = `${this.opnetAPIUrl}/api/v1/${this.rpc}`;

        const resp: Response = await fetch(url, params);
        if (!resp.ok) {
            throw new Error(`Failed to fetch to rpc: ${resp.statusText}`);
        }

        const fetchedData = (await resp.json()) as {
            result: {
                error?: string;
            };
        };
        if (!fetchedData) {
            throw new Error('No data fetched');
        }

        const result = fetchedData.result;
        if (!result) {
            throw new Error('No rpc parameters found');
        }

        if ('error' in result) {
            throw new Error(`Error in fetching to rpc ${result.error}`);
        }

        return result;
    }

    /**
     * Fetches the wrap parameters from the OPNET node
     * @param {bigint} amount - The amount to wrap
     * @returns {Promise<WrappedGeneration | undefined>} - The wrap parameters fetched
     * @throws {Error} - If wrap parameters could not be fetched
     */
    /*public async fetchWrapParameters(amount: bigint): Promise<WrappedGeneration | undefined> {
        if (amount < currentConsensusConfig.VAULT_MINIMUM_AMOUNT) {
            throw new Error(
                `Amount must be greater than the minimum consolidation amount ${currentConsensusConfig.VAULT_MINIMUM_AMOUNT}sat.`,
            );
        }

        const params = [0, amount.toString()];
        const result = await this.rpcMethod('btc_generate', params);

        if (!result) {
            return;
        }

        return new WrappedGeneration(result as WrappedGenerationParameters);
    }*/

    /**
     * Fetches the wrap parameters from the OPNET node
     * @param {bigint} amount - The amount to wrap
     * @param {string} receiver - The receiver address
     * @returns {Promise<UnwrapGeneration | undefined>} - The wrap parameters fetched
     * @throws {Error} - If wrap parameters could not be fetched
     */
    /*public async fetchUnWrapParameters(
        amount: bigint,
        receiver: Address,
    ): Promise<UnwrapGeneration | undefined> {
        if (amount < 330n) {
            throw new Error(
                `Amount must be greater than the minimum consolidation amount ${currentConsensusConfig.VAULT_MINIMUM_AMOUNT}sat.`,
            );
        }

        if (receiver.length < 50) {
            throw new Error('Invalid receiver address');
        }

        const params = [1, amount.toString(), receiver.toHex()];
        const result = await this.rpcMethod('btc_generate', params);

        if (!result) {
            return;
        }

        return new UnwrapGeneration(result as UnwrappedGenerationParameters);
    }*/
}
