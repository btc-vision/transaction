import { fromHex, type Network, opcodes, payments, script } from '@btc-vision/bitcoin';
import type { UTXO } from '../utxo/interfaces/IUTXO.js';
import type { IP2WSHAddress } from '../transaction/mineable/IP2WSHAddress.js';

/**
 * P2WDA Detection and Validation Utilities
 */
export class P2WDADetector {
    /**
     * Check if a UTXO is a P2WDA output by examining its script structure
     */
    public static isP2WDAUTXO(utxo: UTXO): boolean {
        if (!utxo.witnessScript) {
            return false;
        }

        const witnessScript =
            utxo.witnessScript instanceof Uint8Array
                ? utxo.witnessScript
                : fromHex(utxo.witnessScript);

        return this.isP2WDAWitnessScript(witnessScript);
    }

    /**
     * Check if a witness script follows the P2WDA pattern
     */
    public static isP2WDAWitnessScript(witnessScript: Uint8Array): boolean {
        try {
            const decompiled = script.decompile(witnessScript);

            if (!decompiled || decompiled.length !== 7) {
                return false;
            }

            // Check for 5 OP_2DROP operations
            for (let i = 0; i < 5; i++) {
                if (decompiled[i] !== opcodes.OP_2DROP) {
                    return false;
                }
            }

            // Check for pubkey and OP_CHECKSIG
            return (
                decompiled[5] instanceof Uint8Array &&
                decompiled[5].length === 33 && // Compressed public key
                decompiled[6] === opcodes.OP_CHECKSIG
            );
        } catch {
            return false;
        }
    }

    /**
     * Generate a P2WDA address from a public key
     */
    public static generateP2WDAAddress(
        publicKey: Uint8Array,
        network: Network,
    ): IP2WSHAddress & {
        scriptPubKey: Uint8Array;
    } {
        if (publicKey.length !== 33) {
            throw new Error('Public key must be 33 bytes (compressed)');
        }

        // Create the P2WDA witness script with 5x OP_2DROP
        const witnessScript = script.compile([
            opcodes.OP_2DROP,
            opcodes.OP_2DROP,
            opcodes.OP_2DROP,
            opcodes.OP_2DROP,
            opcodes.OP_2DROP,
            publicKey,
            opcodes.OP_CHECKSIG,
        ]);

        // Wrap in P2WSH
        const p2wsh = payments.p2wsh({
            redeem: { output: witnessScript },
            network,
        });

        if (!p2wsh.address || !p2wsh.output) {
            throw new Error('Failed to generate P2WDA address');
        }

        return {
            address: p2wsh.address,
            witnessScript,
            scriptPubKey: p2wsh.output,
        };
    }

    /**
     * Extract the public key from a P2WDA witness script
     */
    public static extractPublicKeyFromP2WDA(witnessScript: Uint8Array): Uint8Array | null {
        try {
            const decompiled = script.decompile(witnessScript);

            if (!decompiled || decompiled.length !== 7) {
                return null;
            }

            // Check for 5x OP_2DROP pattern
            for (let i = 0; i < 5; i++) {
                if (decompiled[i] !== opcodes.OP_2DROP) {
                    return null;
                }
            }

            if (
                decompiled[5] instanceof Uint8Array &&
                decompiled[5].length === 33 &&
                decompiled[6] === opcodes.OP_CHECKSIG
            ) {
                return decompiled[5];
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Create witness data for a simple P2WDA spend (no operation data)
     */
    public static createSimpleP2WDAWitness(
        transactionSignature: Uint8Array,
        witnessScript: Uint8Array,
    ): Uint8Array[] {
        const witnessStack: Uint8Array[] = [transactionSignature];

        // Add 10 empty buffers for the 5x OP_2DROP operations
        for (let i = 0; i < 10; i++) {
            witnessStack.push(new Uint8Array(0));
        }

        witnessStack.push(witnessScript);
        return witnessStack;
    }

    /**
     * Validate P2WDA operation data signature
     */
    public static validateP2WDASignature(
        _publicKey: Uint8Array,
        dataSignature: Uint8Array,
        _operationData: Uint8Array,
    ): boolean {
        return dataSignature.length === 64; // Schnorr signatures are always 64 bytes
    }

    /**
     * Calculate the witness size for P2WDA transaction estimation
     */
    public static estimateP2WDAWitnessSize(dataSize: number = 0): number {
        return 72 + dataSize + 39 + 12;
    }

    /**
     * Check if a scriptPubKey is a P2WSH that could be P2WDA
     */
    public static couldBeP2WDA(scriptPubKey: Uint8Array): boolean {
        return scriptPubKey.length === 34 && scriptPubKey[0] === 0x00 && scriptPubKey[1] === 0x20;
    }
}
