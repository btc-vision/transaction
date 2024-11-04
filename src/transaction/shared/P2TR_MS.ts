import { Network, networks } from '@btc-vision/bitcoin';
import { EcKeyPair } from '../../keypair/EcKeyPair.js';
import { MultiSignParameters, MultiSignTransaction } from '../builders/MultiSignTransaction.js';

export class P2TR_MS {
    /**
     * Generate a multi-sig address
     * @param {Buffer[]} pubKeys - The public keys to use
     * @param {number} minimumSignatureRequired - The minimum number of signatures required
     * @param {Network} network - The network to use
     * @returns {string} - The generated address
     * @throws {Error} - If the address cannot be generated
     */
    public static generateMultiSigAddress(
        pubKeys: Buffer[],
        minimumSignatureRequired: number,
        network: Network = networks.bitcoin,
    ): string {
        const publicKeys: Buffer[] = EcKeyPair.verifyPubKeys(pubKeys, network);
        if (publicKeys.length !== pubKeys.length) throw new Error(`Contains invalid public keys`);

        // fake params
        const multiSignParams: MultiSignParameters = {
            network: network,
            utxos: [],
            pubkeys: pubKeys,
            minimumSignatures: minimumSignatureRequired,
            feeRate: 100,
            receiver: 'a',
            requestedAmount: 1n,
            refundVault: 'a',
        };

        const address = new MultiSignTransaction(multiSignParams).getScriptAddress();
        if (!address) {
            throw new Error('Failed to generate address');
        }

        return address;
    }
}
