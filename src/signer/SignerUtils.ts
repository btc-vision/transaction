// Helper functions
import { crypto as bitCrypto, PsbtInput } from '@btc-vision/bitcoin';
import { isP2TR } from '@btc-vision/bitcoin/src/psbt/psbtutils.js';
import { toXOnly } from '@btc-vision/bitcoin/src/psbt/bip371.js';
import * as bscript from '@btc-vision/bitcoin/src/script.js';

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

export function pubkeyPositionInScript(pubkey: Buffer, script: Buffer): number {
    const pubkeyHash = bitCrypto.hash160(pubkey);
    const pubkeyXOnly = toXOnly(pubkey);

    const decompiled = bscript.decompile(script);
    if (decompiled === null) throw new Error('Unknown script error');

    const a = decompiled.findIndex((element) => {
        if (typeof element === 'number') return false;
        return element.equals(pubkey) || element.equals(pubkeyHash) || element.equals(pubkeyXOnly);
    });

    return a;
}

export function pubkeyInScript(pubkey: Buffer, script: Buffer): boolean {
    return pubkeyPositionInScript(pubkey, script) !== -1;
}
