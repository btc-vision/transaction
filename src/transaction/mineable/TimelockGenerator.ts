import bitcoin, { Network, networks, opcodes, script } from '@btc-vision/bitcoin';
import { IP2WSHAddress } from './IP2WSHAddress.js';

export class TimeLockGenerator {
    private static readonly CSV_BLOCKS = 75;

    /**
     * Generate a P2WSH address with CSV timelock
     * Note: This uses ECDSA, not Schnorr (Schnorr only available in Taproot)
     */
    public static generateTimeLockAddress(
        publicKey: Buffer,
        network: Network = networks.bitcoin,
        csvBlocks: number = TimeLockGenerator.CSV_BLOCKS,
    ): IP2WSHAddress {
        const witnessScript = script.compile([
            script.number.encode(csvBlocks),
            opcodes.OP_CHECKSEQUENCEVERIFY,
            opcodes.OP_DROP,
            publicKey,
            opcodes.OP_CHECKSIG,
        ]);

        const p2wsh = bitcoin.payments.p2wsh({
            redeem: { output: witnessScript },
            network,
        });

        if (!p2wsh.address) {
            throw new Error('Failed to generate P2WSH address');
        }

        return {
            address: p2wsh.address,
            witnessScript: witnessScript,
        };
    }
}
