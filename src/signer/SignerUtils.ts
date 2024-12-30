// Helper functions
import { PsbtInput } from '@btc-vision/bitcoin';
import { isP2TR, pubkeyPositionInScript } from '@btc-vision/bitcoin/src/psbt/psbtutils.js';

export function isTaprootInput(input: PsbtInput): boolean {
    return (
        input &&
        !!(
            input.tapInternalKey ||
            input.tapMerkleRoot ||
            (input.tapLeafScript && input.tapLeafScript.length) ||
            (input.tapBip32Derivation && input.tapBip32Derivation.length) ||
            (input.witnessUtxo && isP2TR(input.witnessUtxo.script))
        )
    );
}

export function getInputRelevantScript(input: PsbtInput): Buffer | null {
    if (input.redeemScript) {
        return input.redeemScript;
    }
    if (input.witnessScript) {
        return input.witnessScript;
    }
    if (input.witnessUtxo) {
        return input.witnessUtxo.script;
    }
    if (input.nonWitnessUtxo) {
        // Parse the full transaction from nonWitnessUtxo
        /*const tx = Transaction.fromBuffer(input.nonWitnessUtxo);
        // Retrieve the output referenced by the input index
        const out = tx.outs[input.index];
        if (!out) {
            throw new Error(`No output at index ${input.index} in nonWitnessUtxo`);
        }
        return out.script;*/
    }
    return null;
}

export function canSignNonTaprootInput(input: PsbtInput, publicKey: Buffer): boolean {
    if (
        (input.nonWitnessUtxo &&
            !input.redeemScript &&
            !input.witnessScript &&
            !input.witnessUtxo) ||
        input.redeemScript
    ) {
        return true;
    }

    const script = getInputRelevantScript(input);
    if (script) {
        return pubkeyInScript(publicKey, script);
    }
    return false;
}

/**
 * Checks if a public key is present in a script.
 * @param pubkey The public key to check.
 * @param script The script to search in.
 * @returns A boolean indicating whether the public key is present in the script.
 */
export function pubkeyInScript(pubkey: Buffer, script: Buffer): boolean {
    return pubkeyPositionInScript(pubkey, script) !== -1;
}
