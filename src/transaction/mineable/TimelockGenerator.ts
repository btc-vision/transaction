import bitcoin, {
    fromHex,
    type Network,
    networks,
    opcodes,
    type PublicKey,
    type Script,
    script,
    type XOnlyPublicKey,
} from '@btc-vision/bitcoin';
import type { IP2WSHAddress } from './IP2WSHAddress.js';

export class TimeLockGenerator {
    private static readonly UNSPENDABLE_INTERNAL_KEY = fromHex(
        '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
    );

    private static readonly CSV_BLOCKS = 75;

    /**
     * Generate a P2WSH address with CSV timelock
     * Note: This uses ECDSA, not Schnorr (Schnorr only available in Taproot)
     */
    public static generateTimeLockAddress(
        publicKey: PublicKey,
        network: Network = networks.bitcoin,
        csvBlocks: number = TimeLockGenerator.CSV_BLOCKS,
    ): IP2WSHAddress {
        const witnessScript: Script = this.generateTimeLockScript(publicKey, csvBlocks);

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

    /**
     * Generate a P2TR address with CSV time lock
     * Note: This uses Schnorr signatures
     */
    public static generateTimeLockAddressP2TR(
        publicKey: XOnlyPublicKey,
        network: Network = networks.bitcoin,
        csvBlocks: number = TimeLockGenerator.CSV_BLOCKS,
    ): string {
        if (publicKey.length !== 32) {
            throw new Error('Public key must be 32 bytes for Taproot');
        }

        const witnessScript: Script = this.generateTimeLockScript(publicKey, csvBlocks);
        const taproot = bitcoin.payments.p2tr({
            redeem: { output: witnessScript },
            network,
            internalPubkey: TimeLockGenerator.UNSPENDABLE_INTERNAL_KEY as XOnlyPublicKey,
        });

        if (!taproot.address) {
            throw new Error('Failed to generate P2TR address');
        }

        return taproot.address;
    }

    private static generateTimeLockScript(
        publicKey: PublicKey | XOnlyPublicKey,
        csvBlocks: number = TimeLockGenerator.CSV_BLOCKS,
    ): Script {
        return script.compile([
            script.number.encode(csvBlocks),
            opcodes.OP_CHECKSEQUENCEVERIFY,
            opcodes.OP_DROP,
            publicKey,
            opcodes.OP_CHECKSIG,
        ]);
    }
}
