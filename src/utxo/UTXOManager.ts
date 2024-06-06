import { FetchUTXOParams, RawUTXOResponse, UTXO } from './interfaces/IUTXO.js';

/**
 * Allows to fetch UTXO data from any OPNET node
 */
export class UTXOManager {
    private readonly utxoPath: string = 'address/utxos';

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

            if (currentAmount + utxoValue > amountRequested) {
                break;
            }
        }

        return finalUTXOs;
    }
}
