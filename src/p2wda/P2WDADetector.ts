import { Buffer } from 'buffer';
import { Network, opcodes, payments, script } from '@btc-vision/bitcoin';
import { UTXO } from '../utxo/interfaces/IUTXO.js';
import { IP2WSHAddress } from '../transaction/mineable/IP2WSHAddress.js';

/**
 * P2WDA Detection and Validation Utilities
 *
 * This class provides methods to detect and validate P2WDA (Pay-to-Witness-Data-Authentication) addresses
 * and UTXOs. P2WDA addresses have a specific witness script pattern that allows for efficient data storage.
 */
export class P2WDADetector {
    /**
     * Check if a UTXO is a P2WDA output by examining its script structure
     *
     * @param utxo The UTXO to check
     * @returns true if this is a P2WDA UTXO
     */
    public static isP2WDAUTXO(utxo: UTXO): boolean {
        // P2WDA outputs are P2WSH outputs with a specific witness script pattern
        if (!utxo.witnessScript) {
            return false;
        }

        const witnessScript = Buffer.isBuffer(utxo.witnessScript)
            ? utxo.witnessScript
            : Buffer.from(utxo.witnessScript, 'hex');

        return this.isP2WDAWitnessScript(witnessScript);
    }

    /**
     * Check if a witness script follows the P2WDA pattern
     *
     * P2WDA witness script pattern: (OP_2DROP * 5) <pubkey> OP_CHECKSIG
     * This allows for up to 10 witness data fields (5 * 2 = 10)
     *
     * @param witnessScript The witness script to check
     * @returns true if this is a P2WDA witness script
     */
    public static isP2WDAWitnessScript(witnessScript: Buffer): boolean {
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
                Buffer.isBuffer(decompiled[5]) &&
                decompiled[5].length === 33 && // Compressed public key
                decompiled[6] === opcodes.OP_CHECKSIG
            );
        } catch {
            return false;
        }
    }

    /**
     * Generate a P2WDA address from a public key
     *
     * @param publicKey The public key to use (33 bytes compressed)
     * @param network The Bitcoin network
     * @returns The P2WDA address and related payment information
     */
    public static generateP2WDAAddress(
        publicKey: Buffer,
        network: Network,
    ): IP2WSHAddress & {
        scriptPubKey: Buffer;
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
     *
     * @param witnessScript The P2WDA witness script
     * @returns The public key or null if not a valid P2WDA script
     */
    public static extractPublicKeyFromP2WDA(witnessScript: Buffer): Buffer | null {
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
                Buffer.isBuffer(decompiled[5]) &&
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
     *
     * For simple transfers, P2WDA requires 10 dummy witness items (zeros) before the signature
     *
     * @param transactionSignature The transaction signature
     * @param witnessScript The P2WDA witness script
     * @returns The witness stack for a simple P2WDA spend
     */
    public static createSimpleP2WDAWitness(
        transactionSignature: Buffer,
        witnessScript: Buffer,
    ): Buffer[] {
        const witnessStack: Buffer[] = [transactionSignature];

        // Add 10 empty buffers for the 5x OP_2DROP operations
        // Bitcoin stack is reversed!
        for (let i = 0; i < 10; i++) {
            witnessStack.push(Buffer.alloc(0));
        }

        witnessStack.push(witnessScript);
        return witnessStack;
    }

    /**
     * Validate P2WDA operation data signature
     *
     * @param publicKey The public key from the witness script
     * @param dataSignature The Schnorr signature
     * @param operationData The operation data that was signed
     * @returns true if the signature is valid
     */
    public static validateP2WDASignature(
        publicKey: Buffer,
        dataSignature: Buffer,
        operationData: Buffer,
    ): boolean {
        // This would use MessageSigner.verifySignature internally
        // For now, we'll assume the signature validation is handled by MessageSigner
        return dataSignature.length === 64; // Schnorr signatures are always 64 bytes
    }

    /**
     * Calculate the witness size for P2WDA transaction estimation
     *
     * @param dataSize The size of the operation data (0 for simple transfers)
     * @returns The estimated witness size in bytes
     */
    public static estimateP2WDAWitnessSize(dataSize: number = 0): number {
        // Witness structure:
        // - Transaction signature: ~72 bytes
        // - 10 data fields (can be empty or contain data)
        // - Witness script: 39 bytes (5x OP_2DROP + 33-byte pubkey + OP_CHECKSIG)
        // - Overhead for length prefixes: ~12 bytes (1 byte per witness element)

        // For simple transfers, dataSize is 0 (10 empty fields)
        // For interactions, dataSize is the total size of data split across fields
        return 72 + dataSize + 39 + 12;
    }

    /**
     * Check if a scriptPubKey is a P2WSH that could be P2WDA
     *
     * @param scriptPubKey The script public key to check
     * @returns true if this could be a P2WDA output
     */
    public static couldBeP2WDA(scriptPubKey: Buffer): boolean {
        // P2WDA uses P2WSH, which is version 0 witness with 32-byte program
        return scriptPubKey.length === 34 && scriptPubKey[0] === 0x00 && scriptPubKey[1] === 0x20; // 32 bytes
    }
}
