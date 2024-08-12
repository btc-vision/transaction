import { FetchUTXOParams, FetchUTXOParamsMultiAddress, RawUTXOResponse, UTXO } from './interfaces/IUTXO.js';
import { WrappedGeneration } from '../wbtc/WrappedGenerationParameters.js';
import { UnwrappedGenerationParameters, WrappedGenerationParameters } from '../wbtc/Generate.js';
import { BroadcastResponse } from './interfaces/BroadcastResponse.js';
import { Address } from '@btc-vision/bsi-binary';
import { UnwrapGeneration } from '../wbtc/UnwrapGeneration.js';
import { currentConsensusConfig } from '../consensus/ConsensusConfig.js';

/**
 * Allows to fetch UTXO data from any OPNET node
 */
export class OPNetLimitedProvider {
    private readonly utxoPath: string = 'address/utxos';
    private readonly rpc: string = 'json-rpc';

    constructor(private readonly opnetAPIUrl: string) {}

    /**
     * Fetches UTXO data from the OPNET node
     * @param {FetchUTXOParams} settings - The settings to fetch UTXO data
     * @returns {Promise<UTXO[]>} - The UTXOs fetched
     * @throws {Error} - If UTXOs could not be fetched
     */
    public async fetchUTXO(settings: FetchUTXOParams): Promise<UTXO[]> {
        const params = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const url: string = `${this.opnetAPIUrl}/api/v1/${this.utxoPath}?address=${settings.address}&optimized=${settings.optimized ?? false}`;
        const resp: Response = await fetch(url, params);

        if (!resp.ok) {
            throw new Error(`Failed to fetch UTXO data: ${resp.statusText}`);
        }

        const fetchedData: RawUTXOResponse[] = await resp.json();
        if (fetchedData.length === 0) {
            throw new Error('No UTXO found');
        }

        const meetCriteria: RawUTXOResponse[] = fetchedData.filter((utxo: RawUTXOResponse) => {
            return BigInt(utxo.value) >= settings.minAmount;
        });

        if (meetCriteria.length === 0) {
            throw new Error('No UTXO found (minAmount)');
        }

        let finalUTXOs: UTXO[] = [];
        let currentAmount: bigint = 0n;

        const amountRequested: bigint = settings.requestedAmount;
        for (const utxo of meetCriteria) {
            const utxoValue: bigint = BigInt(utxo.value);

            // check if value is greater than 0
            if (utxoValue <= 0n) {
                continue;
            }

            currentAmount += utxoValue;
            finalUTXOs.push({
                transactionId: utxo.transactionId,
                outputIndex: utxo.outputIndex,
                value: utxoValue,
                scriptPubKey: utxo.scriptPubKey,
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

        for (let address of settings.addresses) {
            const params: FetchUTXOParams = {
                address: address,
                minAmount: settings.minAmount,
                requestedAmount: settings.requestedAmount,
                optimized: settings.optimized,
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
            let utxo = all[i];

            if (currentAmount >= settings.requestedAmount) {
                break;
            }

            currentAmount += utxo.value;
            finalUTXOs.push(utxo);
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

        try {
            const resp: Response = await fetch(url, params);
            if (!resp.ok) {
                throw new Error(`Failed to fetch to rpc: ${resp.statusText}`);
            }

            const fetchedData = await resp.json();
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
        } catch (e) {
            console.error(`Failed to fetch wrap parameters: ${(e as Error).stack}`);
        }
    }

    /**
     * Fetches the wrap parameters from the OPNET node
     * @param {bigint} amount - The amount to wrap
     * @returns {Promise<WrappedGeneration | undefined>} - The wrap parameters fetched
     * @throws {Error} - If wrap parameters could not be fetched
     */
    public async fetchWrapParameters(amount: bigint): Promise<WrappedGeneration | undefined> {
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
    }

    /**
     * Fetches the wrap parameters from the OPNET node
     * @param {bigint} amount - The amount to wrap
     * @param {Address} receiver - The receiver address
     * @returns {Promise<UnwrapGeneration | undefined>} - The wrap parameters fetched
     * @throws {Error} - If wrap parameters could not be fetched
     */
    public async fetchUnWrapParameters(
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

        const params = [1, amount.toString(), receiver];
        const result = await this.rpcMethod('btc_generate', params);

        if (!result) {
            return;
        }

        return new UnwrapGeneration(result as UnwrappedGenerationParameters);
    }
}
