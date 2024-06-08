import { FetchUTXOParams, RawUTXOResponse, UTXO } from './interfaces/IUTXO.js';
import { WrappedGeneration } from '../wbtc/WrappedGenerationParameters.js';
import { WrappedGenerationParameters } from '../wbtc/Generate.js';

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

        const url: string = `${this.opnetAPIUrl}/api/v1/${this.utxoPath}?address=${settings.address}`;
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
     * Fetches the wrap parameters from the OPNET node
     * @param {bigint} amount - The amount to wrap
     * @returns {Promise<WrappedGeneration | undefined>} - The wrap parameters fetched
     * @throws {Error} - If wrap parameters could not be fetched
     */
    public async fetchWrapParameters(amount: bigint): Promise<WrappedGeneration | undefined> {
        const params = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'btc_generate',
                params: [0, amount.toString()],
                id: 1,
            }),
        };

        const url: string = `${this.opnetAPIUrl}/api/v1/${this.rpc}`;

        try {
            const resp: Response = await fetch(url, params);
            if (!resp.ok) {
                throw new Error(`Failed to fetch wrap parameters: ${resp.statusText}`);
            }

            const fetchedData = await resp.json();
            if (!fetchedData) {
                throw new Error('No wrap parameters found');
            }

            const result = fetchedData.result;
            if (!result) {
                throw new Error('No wrap parameters found');
            }

            if ('error' in result) {
                throw new Error('Something went wrong while fetching wrap parameters');
            }

            return new WrappedGeneration(result as WrappedGenerationParameters);
        } catch (e) {
            console.error(`Failed to fetch wrap parameters: ${(e as Error).stack}`);
        }
    }
}
