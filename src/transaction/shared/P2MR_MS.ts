import { type Network, networks } from '@btc-vision/bitcoin';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import {
    type MultiSignParameters,
    MultiSignTransaction,
} from '../builders/MultiSignTransaction.js';

export class P2MR_MS {
    /**
     * Generate a multi-sig P2MR address
     * @param {Uint8Array[]} pubKeys - The public keys to use
     * @param {number} minimumSignatureRequired - The minimum number of signatures required
     * @param {Network} network - The network to use
     * @returns {string} - The generated address
     * @throws {Error} - If the address cannot be generated
     */
    public static generateMultiSigAddress(
        pubKeys: Uint8Array[],
        minimumSignatureRequired: number,
        network: Network = networks.bitcoin,
    ): string {
        const publicKeys: Uint8Array[] = EcKeyPair.verifyPubKeys(pubKeys, network);
        if (publicKeys.length !== pubKeys.length) throw new Error(`Contains invalid public keys`);

        // fake params
        const multiSignParams: MultiSignParameters = {
            network: network,
            utxos: [],
            pubkeys: publicKeys,
            minimumSignatures: minimumSignatureRequired,
            feeRate: 100,
            receiver: 'a',
            requestedAmount: 1n,
            refundVault: 'a',
            mldsaSigner: null,
            useP2MR: true,
        };

        const address = new MultiSignTransaction(multiSignParams).getScriptAddress();
        if (!address) {
            throw new Error('Failed to generate address');
        }

        return address;
    }
}
