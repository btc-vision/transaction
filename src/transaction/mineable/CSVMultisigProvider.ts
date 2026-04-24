import {
    equals,
    fromHex,
    isP2TR,
    type Network,
    opcodes,
    payments,
    type Psbt,
    type Script,
    script,
    type TapScriptSig,
    type XOnlyPublicKey,
} from '@btc-vision/bitcoin';
import { witnessStackToScriptWitness } from '../utils/WitnessUtils.js';
import type { UTXO } from '../../utxo/interfaces/IUTXO.js';

export const NUMS_INTERNAL_KEY: Uint8Array = fromHex(
    '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
);

export const LEAF_VERSION_TAPSCRIPT = 0xc0;

export interface CSVMultisigConfig {
    /** x,only (32 byte) pubkeys. Signature order is the reverse of this array. */
    pubkeys: XOnlyPublicKey[];

    /** k of n threshold, fixed at 2 for CSV2Multisig but kept configurable. */
    threshold: number;

    /** Block,based relative lock, 1..65535. */
    csvBlocks: number;
}

export interface CSVMultisigAddress {
    address: string;
    tapscript: Uint8Array;
    scriptPubKey: Uint8Array;
    controlBlock: Uint8Array;
    internalPubkey: Uint8Array;
    leafVersion: number;
    config: CSVMultisigConfig;
}

export class CSVMultisigProvider {
    public static readonly NUMS_INTERNAL_KEY = NUMS_INTERNAL_KEY;
    public static readonly LEAF_VERSION = LEAF_VERSION_TAPSCRIPT;

    /** Build the CSV + k of n CHECKSIGADD tapscript. */
    public static buildTapscript(cfg: CSVMultisigConfig): Script {
        if (cfg.csvBlocks < 1 || cfg.csvBlocks > 0xffff) {
            throw new Error('csvBlocks must be between 1 and 65535');
        }

        if (cfg.pubkeys.length === 0) {
            throw new Error('At least one pubkey required');
        }

        if (cfg.threshold < 1 || cfg.threshold > cfg.pubkeys.length) {
            throw new Error('Invalid threshold');
        }

        for (const pk of cfg.pubkeys) {
            if (pk.length !== 32) {
                throw new Error('Tapscript pubkeys must be 32 bytes (x,only)');
            }
        }

        const chunks: (number | Uint8Array)[] = [];

        // Relative timelock gate
        chunks.push(script.number.encode(cfg.csvBlocks));
        chunks.push(opcodes.OP_CHECKSEQUENCEVERIFY);
        chunks.push(opcodes.OP_DROP);

        // k of n multisig
        chunks.push(cfg.pubkeys[0] as XOnlyPublicKey, opcodes.OP_CHECKSIG);
        for (let i = 1; i < cfg.pubkeys.length; i++) {
            chunks.push(cfg.pubkeys[i] as XOnlyPublicKey, opcodes.OP_CHECKSIGADD);
        }

        if (cfg.threshold >= 1 && cfg.threshold <= 16) {
            chunks.push(opcodes.OP_1 + cfg.threshold - 1);
        } else {
            chunks.push(script.number.encode(cfg.threshold));
        }

        chunks.push(opcodes.OP_NUMEQUAL);

        return script.compile(chunks);
    }

    /** Convenience: 2 of N with fixed threshold. */
    public static buildCSV2MultisigTapscript(
        pubkeys: XOnlyPublicKey[],
        csvBlocks: number,
    ): Uint8Array {
        return this.buildTapscript({ pubkeys, threshold: 2, csvBlocks });
    }

    /** Single leaf tree, NUMS internal key, key path is unspendable. */
    public static generateAddress(cfg: CSVMultisigConfig, network: Network): CSVMultisigAddress {
        const tapscript = this.buildTapscript(cfg);

        const p2tr = payments.p2tr({
            internalPubkey: NUMS_INTERNAL_KEY as XOnlyPublicKey,
            scriptTree: { output: tapscript },
            redeem: {
                output: tapscript,
                redeemVersion: LEAF_VERSION_TAPSCRIPT,
            },
            network,
        });

        if (!p2tr.address || !p2tr.output || !p2tr.witness || p2tr.witness.length < 2) {
            throw new Error('Failed to generate CSV multisig P2TR address');
        }

        const control = p2tr.witness[p2tr.witness.length - 1];
        if (!control) {
            throw new Error('Failed to generate CSV multisig P2TR address');
        }

        return {
            address: p2tr.address,
            tapscript,
            scriptPubKey: p2tr.output,
            controlBlock: control,
            internalPubkey: NUMS_INTERNAL_KEY,
            leafVersion: LEAF_VERSION_TAPSCRIPT,
            config: cfg,
        };
    }

    /**
     * Encode the nSequence value the spending input must use.
     * BIP 68: disable bit (1 << 31) = 0, type,flag (1 << 22) = 0 for blocks,
     * low 16 bits carry the block count.
     */
    public static encodeSequence(csvBlocks: number): number {
        if (csvBlocks < 1 || csvBlocks > 0xffff) {
            throw new Error('csvBlocks out of range');
        }

        return csvBlocks & 0x0000ffff;
    }

    /**
     * Build witness stack for a script path spend.
     *
     * Returns { witness, sequence }. The caller MUST set nSequence = sequence
     * on the spending input, otherwise OP_CHECKSEQUENCEVERIFY will fail.
     * Transaction nVersion must be >= 2 for CSV to be enforced at all.
     */
    public static buildSpendWitness(
        signatures: Uint8Array[],
        addr: CSVMultisigAddress,
    ): { witness: Uint8Array[]; sequence: number } {
        const { config, tapscript, controlBlock } = addr;

        if (signatures.length !== config.pubkeys.length) {
            throw new Error('signatures length must match pubkeys length');
        }

        for (const sig of signatures) {
            if (sig.length !== 0 && sig.length !== 64 && sig.length !== 65) {
                throw new Error('Each sig must be empty, 64, or 65 bytes');
            }
        }

        const provided = signatures.filter((s) => s.length > 0).length;
        if (provided < config.threshold) {
            throw new Error(`Need ${config.threshold} signatures, got ${provided}`);
        }

        const witness: Uint8Array[] = [];

        // Reverse pubkey order: sig for pubkeys[0] must end up on top of stack.
        for (let i = signatures.length - 1; i >= 0; i--) {
            witness.push(signatures[i] as Uint8Array);
        }

        witness.push(tapscript);
        witness.push(controlBlock);

        return { witness, sequence: this.encodeSequence(config.csvBlocks) };
    }

    public static isP2TRScriptPubKey(scriptPubKey: Uint8Array): boolean {
        return isP2TR(scriptPubKey);
    }

    /**
     * Derive the full CSV multisig address from just the tapscript.
     *
     * The tapscript alone fully determines the address because:
     *  - the internal key is the hard coded NUMS point,
     *  - the tap tree is a single leaf,
     *  - the leaf version is LEAF_VERSION_TAPSCRIPT (0xc0).
     *
     * Returns null when the tapscript does not match the CSV multisig shape.
     */
    public static deriveAddressFromTapscript(
        tapscript: Uint8Array,
        network: Network,
    ): CSVMultisigAddress | null {
        const config = this.parseTapscript(tapscript);
        if (!config) return null;

        return this.generateAddress(config, network);
    }

    /**
     * Witness stack size needed for fee estimation.
     *
     * threshold 64-byte Schnorr sigs at the bottom (pushed first by the caller),
     * plus (n - threshold) empty placeholders for unsigned slots,
     * plus the tapscript, plus the control block.
     */
    public static buildDummyWitness(addr: CSVMultisigAddress): Uint8Array[] {
        const { config, tapscript, controlBlock } = addr;
        const witness: Uint8Array[] = [];

        // Position 0..n-1 maps to pubkey n-1..0 on the stack.
        // For estimation we put real 64-byte sigs in the last `threshold` positions
        // (matching the highest-indexed pubkeys), and empties elsewhere.
        for (let i = 0; i < config.pubkeys.length; i++) {
            const stackPos = config.pubkeys.length - 1 - i;
            if (stackPos < config.threshold) {
                witness.push(new Uint8Array(64));
            } else {
                witness.push(new Uint8Array(0));
            }
        }

        witness.push(tapscript);
        witness.push(controlBlock);
        return witness;
    }

    /**
     * Build the final witness stack from collected PSBT tapScriptSig entries.
     *
     * Each entry is matched to its pubkey in the tapscript. Missing entries
     * produce empty (zero-length) placeholders so the remaining signatures can
     * still validate at positions above threshold.
     */
    public static buildFinalWitnessFromTapScriptSigs(
        tapScriptSigs: readonly TapScriptSig[],
        addr: CSVMultisigAddress,
    ): Uint8Array[] {
        const { config, tapscript, controlBlock } = addr;

        const sigsByPubkey = new Map<string, Uint8Array>();
        for (const entry of tapScriptSigs) {
            if (!entry.pubkey || entry.pubkey.length !== 32) continue;
            sigsByPubkey.set(toHexKey(entry.pubkey), entry.signature);
        }

        const ordered: Uint8Array[] = [];
        let provided = 0;
        for (const pk of config.pubkeys) {
            const sig = sigsByPubkey.get(toHexKey(pk));
            if (sig) {
                if (sig.length !== 64 && sig.length !== 65) {
                    throw new Error(
                        `Invalid Schnorr signature length ${sig.length} for CSV multisig spend`,
                    );
                }

                ordered.push(sig);
                provided++;
            } else {
                ordered.push(new Uint8Array(0));
            }
        }

        if (provided < config.threshold) {
            throw new Error(
                `CSV multisig spend needs ${config.threshold} signatures, got ${provided}`,
            );
        }

        const witness: Uint8Array[] = [];
        // Reverse pubkey order so that the signature for pubkeys[0] lands on top of the stack.
        for (let i = ordered.length - 1; i >= 0; i--) {
            witness.push(ordered[i] as Uint8Array);
        }

        witness.push(tapscript);
        witness.push(controlBlock);
        return witness;
    }

    /**
     * True when this UTXO is a CSV multisig P2TR output that this provider can spend.
     *
     * Requires both the P2TR scriptPubKey and a witnessScript (the tapscript) on
     * the UTXO, and checks the tapscript shape AND that the scriptPubKey matches
     * the address derived from that tapscript (prevents spoofed witnessScripts).
     */
    public static isSpendableUTXO(utxo: UTXO, network: Network): boolean {
        if (!utxo.witnessScript) return false;

        const scriptPub = fromHex(utxo.scriptPubKey.hex);
        if (!isP2TR(scriptPub)) return false;

        const tapscript =
            utxo.witnessScript instanceof Uint8Array
                ? utxo.witnessScript
                : fromHex(utxo.witnessScript);

        const addr = this.deriveAddressFromTapscript(tapscript, network);
        if (!addr) return false;

        return equals(addr.scriptPubKey, scriptPub);
    }

    /**
     * Parse a tapscript that matches the CSV + CHECKSIGADD multisig shape.
     * Returns null if the script does not match.
     */
    public static parseTapscript(tapscript: Uint8Array): CSVMultisigConfig | null {
        const d = script.decompile(tapscript);
        if (!d || d.length < 6) return null;

        // <csvBlocks> CSV DROP
        // Small values (1..16) are minimally encoded as OP_N opcodes by
        // script.compile, so the chunk may be a number rather than a Uint8Array.
        const csvChunk = d[0];
        let csvBlocks: number;
        if (csvChunk instanceof Uint8Array) {
            try {
                csvBlocks = script.number.decode(csvChunk as Buffer);
            } catch {
                return null;
            }
        } else if (
            typeof csvChunk === 'number' &&
            csvChunk >= opcodes.OP_1 &&
            csvChunk <= opcodes.OP_16
        ) {
            csvBlocks = csvChunk - opcodes.OP_1 + 1;
        } else {
            return null;
        }

        if (d[1] !== opcodes.OP_CHECKSEQUENCEVERIFY) return null;
        if (d[2] !== opcodes.OP_DROP) return null;

        // <pk1> CHECKSIG
        let i = 3;
        if (
            !(d[i] instanceof Uint8Array) ||
            (d[i] as Uint8Array).length !== 32 ||
            d[i + 1] !== opcodes.OP_CHECKSIG
        ) {
            return null;
        }

        const pubkeys: XOnlyPublicKey[] = [d[i] as XOnlyPublicKey];
        i += 2;

        // <pkN> CHECKSIGADD pairs
        while (
            i + 1 < d.length &&
            d[i] instanceof Uint8Array &&
            (d[i] as Uint8Array).length === 32 &&
            d[i + 1] === opcodes.OP_CHECKSIGADD
        ) {
            pubkeys.push(d[i] as XOnlyPublicKey);
            i += 2;
        }

        // threshold + OP_NUMEQUAL at the end
        if (i + 2 !== d.length) return null;
        const threshChunk = d[i];
        let threshold: number;
        if (
            typeof threshChunk === 'number' &&
            threshChunk >= opcodes.OP_1 &&
            threshChunk <= opcodes.OP_16
        ) {
            threshold = threshChunk - opcodes.OP_1 + 1;
        } else if (threshChunk instanceof Uint8Array) {
            threshold = script.number.decode(threshChunk as Buffer);
        } else {
            return null;
        }

        if (d[i + 1] !== opcodes.OP_NUMEQUAL) return null;
        if (threshold < 1 || threshold > pubkeys.length) return null;

        return { pubkeys, threshold, csvBlocks };
    }

    /**
     * Finalize a single PSBT input that was set up as a CSV multisig P2TR spend.
     *
     * Collects the tapScriptSig entries that cosigners have added to the PSBT
     * input and writes the final witness. Designed for the collaborative case
     * where signers accumulate signatures on a shared PSBT and then anyone
     * finalizes once threshold is met.
     *
     * `addr` may be omitted when the input's first tapLeafScript carries the
     * tapscript — it is then re-derived here.
     */
    public static finalizePsbtInput(
        psbt: Psbt,
        inputIndex: number,
        network: Network,
        addr?: CSVMultisigAddress,
    ): void {
        const input = psbt.data.inputs[inputIndex];
        if (!input) {
            throw new Error(`PSBT has no input at index ${inputIndex}`);
        }

        let descriptor = addr;
        if (!descriptor) {
            const tls = input.tapLeafScript;
            if (!tls || tls.length === 0 || !tls[0]) {
                throw new Error(
                    `Input #${inputIndex} has no tapLeafScript — pass \`addr\` explicitly`,
                );
            }

            const derived = this.deriveAddressFromTapscript(tls[0].script, network);
            if (!derived) {
                throw new Error(`Input #${inputIndex} tapLeafScript is not a CSV multisig`);
            }

            descriptor = derived;
        }

        const tapSigs = input.tapScriptSig ?? [];
        const witness = this.buildFinalWitnessFromTapScriptSigs(tapSigs, descriptor);

        psbt.finalizeInput(inputIndex, () => ({
            finalScriptSig: undefined,
            finalScriptWitness: witnessStackToScriptWitness(witness),
        }));
    }

    public static isCSVMultisigUTXO(utxo: UTXO): boolean {
        if (!utxo.witnessScript) {
            return false;
        }

        const tapscript =
            utxo.witnessScript instanceof Uint8Array
                ? utxo.witnessScript
                : fromHex(utxo.witnessScript);

        return this.parseTapscript(tapscript) !== null;
    }
}

function toHexKey(u8: Uint8Array): string {
    let s = '';
    for (let i = 0; i < u8.length; i++) {
        s += (u8[i] as number).toString(16).padStart(2, '0');
    }

    return s;
}
