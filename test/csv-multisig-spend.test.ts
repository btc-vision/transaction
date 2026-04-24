import { beforeAll, describe, expect, it } from 'vitest';
import {
    crypto as bitCrypto,
    networks,
    payments,
    Psbt,
    type PsbtInputExtended,
    Transaction,
    toHex,
    toXOnly,
    type XOnlyPublicKey,
} from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type { TapLeafScript, UTXO } from '../build/opnet.js';
import {
    CSVMultisigProvider,
    EcKeyPair,
    FundingTransaction,
    TransactionBuilder,
} from '../build/opnet.js';

const network = networks.regtest;

function makeSigner(seed: string): UniversalSigner {
    return EcKeyPair.fromPrivateKey(
        bitCrypto.sha256(new TextEncoder().encode(seed)),
        network,
    );
}

function buildAddr(signers: UniversalSigner[], csvBlocks: number, threshold = 2) {
    const pubkeys = signers.map((s) => toXOnly(s.publicKey) as XOnlyPublicKey);
    return CSVMultisigProvider.generateAddress({ pubkeys, threshold, csvBlocks }, network);
}

function makeUtxo(addr: ReturnType<typeof buildAddr>, value: bigint): UTXO {
    return {
        transactionId: 'ab'.repeat(32),
        outputIndex: 0,
        value,
        scriptPubKey: {
            hex: toHex(addr.scriptPubKey),
            address: addr.address,
        },
        witnessScript: addr.tapscript,
    };
}

describe('CSV multisig spend', () => {
    let signerA: UniversalSigner;
    let signerB: UniversalSigner;
    let signerC: UniversalSigner;

    beforeAll(() => {
        signerA = makeSigner('csv-multisig-test-A');
        signerB = makeSigner('csv-multisig-test-B');
        signerC = makeSigner('csv-multisig-test-C');
    });

    describe('provider helpers', () => {
        it('derives address from tapscript alone', () => {
            const addr = buildAddr([signerA, signerB, signerC], 10);
            const derived = CSVMultisigProvider.deriveAddressFromTapscript(
                addr.tapscript,
                network,
            );
            expect(derived).not.toBeNull();
            expect(derived!.address).toBe(addr.address);
            expect(derived!.controlBlock).toEqual(addr.controlBlock);
            expect(derived!.config.threshold).toBe(addr.config.threshold);
            expect(derived!.config.csvBlocks).toBe(addr.config.csvBlocks);
        });

        it('returns null for non-CSV tapscripts', () => {
            const derived = CSVMultisigProvider.deriveAddressFromTapscript(
                new Uint8Array([0x51, 0x00]),
                network,
            );
            expect(derived).toBeNull();
        });

        it('isSpendableUTXO enforces scriptPubKey match', () => {
            const addr = buildAddr([signerA, signerB, signerC], 10);
            const utxo = makeUtxo(addr, 100_000n);
            expect(CSVMultisigProvider.isSpendableUTXO(utxo, network)).toBe(true);

            const other = buildAddr([signerA, signerB, signerC], 99);
            const spoofed: UTXO = {
                ...utxo,
                scriptPubKey: {
                    hex: toHex(other.scriptPubKey),
                    address: other.address,
                },
            };
            expect(CSVMultisigProvider.isSpendableUTXO(spoofed, network)).toBe(false);
        });

        it('buildFinalWitnessFromTapScriptSigs orders sigs by tapscript pubkey', () => {
            const addr = buildAddr([signerA, signerB, signerC], 10, 2);

            const fakeSig = (byte: number) => new Uint8Array(64).fill(byte);
            const pkA = toXOnly(signerA.publicKey);
            const pkC = toXOnly(signerC.publicKey);

            const witness = CSVMultisigProvider.buildFinalWitnessFromTapScriptSigs(
                [
                    { pubkey: pkA, leafHash: new Uint8Array(32), signature: fakeSig(0xaa) },
                    { pubkey: pkC, leafHash: new Uint8Array(32), signature: fakeSig(0xcc) },
                ],
                addr,
            );

            expect(witness.length).toBe(addr.config.pubkeys.length + 2);
            // pubkeys = [A, B, C], witness order = [sig_C, sig_B, sig_A, script, controlBlock]
            expect(witness[0]).toEqual(fakeSig(0xcc));
            expect((witness[1] as Uint8Array).length).toBe(0);
            expect(witness[2]).toEqual(fakeSig(0xaa));
            expect(witness[witness.length - 2]).toEqual(addr.tapscript);
            expect(witness[witness.length - 1]).toEqual(addr.controlBlock);
        });

        it('buildFinalWitnessFromTapScriptSigs throws below threshold', () => {
            const addr = buildAddr([signerA, signerB, signerC], 10, 2);
            const fakeSig = new Uint8Array(64).fill(1);
            const pkA = toXOnly(signerA.publicKey);

            expect(() =>
                CSVMultisigProvider.buildFinalWitnessFromTapScriptSigs(
                    [{ pubkey: pkA, leafHash: new Uint8Array(32), signature: fakeSig }],
                    addr,
                ),
            ).toThrow(/needs 2 signatures, got 1/);
        });
    });

    describe('collaborative PSBT flow (2-of-3)', () => {
        it('two signers produce a finalized tx with correct witness shape + CSV sequence', () => {
            const addr = buildAddr([signerA, signerB, signerC], 5, 2);
            const utxo = makeUtxo(addr, 250_000n);

            const psbt = new Psbt({ network });
            psbt.setVersion(2);
            psbt.addInput({
                hash: utxo.transactionId,
                index: utxo.outputIndex,
                sequence: CSVMultisigProvider.encodeSequence(addr.config.csvBlocks),
                witnessUtxo: { value: utxo.value, script: addr.scriptPubKey },
                tapInternalKey: addr.internalPubkey as XOnlyPublicKey,
                tapLeafScript: [
                    {
                        leafVersion: addr.leafVersion,
                        script: addr.tapscript,
                        controlBlock: addr.controlBlock,
                    },
                ],
            });
            psbt.addOutput({ value: 100_000n, script: addr.scriptPubKey });

            psbt.signTaprootInput(0, signerC);
            psbt.signTaprootInput(0, signerA);

            expect(psbt.data.inputs[0]?.tapScriptSig?.length).toBe(2);

            CSVMultisigProvider.finalizePsbtInput(psbt, 0, network);

            const tx: Transaction = psbt.extractTransaction(true, true);
            // Witness: [sig_C, sig_B(empty), sig_A, tapscript, controlBlock] = N + 2
            expect(tx.ins[0]?.witness.length).toBe(addr.config.pubkeys.length + 2);
            expect(tx.ins[0]!.witness[3]).toEqual(addr.tapscript);
            expect(tx.ins[0]!.witness[4]).toEqual(addr.controlBlock);

            // CSV-compatible nSequence: bit 31 clear, low 16 bits = block count.
            expect(tx.ins[0]!.sequence & 0xffff).toBe(addr.config.csvBlocks);
            expect((tx.ins[0]!.sequence >>> 31) & 1).toBe(0);
        });

        it('finalizePsbtInput throws without threshold sigs', () => {
            const addr = buildAddr([signerA, signerB, signerC], 5, 2);
            const utxo = makeUtxo(addr, 250_000n);

            const psbt = new Psbt({ network });
            psbt.setVersion(2);
            psbt.addInput({
                hash: utxo.transactionId,
                index: utxo.outputIndex,
                sequence: CSVMultisigProvider.encodeSequence(addr.config.csvBlocks),
                witnessUtxo: { value: utxo.value, script: addr.scriptPubKey },
                tapInternalKey: addr.internalPubkey as XOnlyPublicKey,
                tapLeafScript: [
                    {
                        leafVersion: addr.leafVersion,
                        script: addr.tapscript,
                        controlBlock: addr.controlBlock,
                    },
                ],
            });
            psbt.addOutput({ value: 100_000n, script: addr.scriptPubKey });

            psbt.signTaprootInput(0, signerA);

            expect(() => CSVMultisigProvider.finalizePsbtInput(psbt, 0, network)).toThrow(
                /needs 2 signatures, got 1/,
            );
        });
    });

    describe('TransactionBuilder auto-detection', () => {
        it('FundingTransaction auto-detects CSV multisig UTXO (threshold = 1)', async () => {
            const addr = buildAddr([signerA], 3, 1);
            const utxo = makeUtxo(addr, 500_000n);
            const recipient = payments.p2tr({
                internalPubkey: toXOnly(signerA.publicKey) as XOnlyPublicKey,
                network,
            }).address as string;

            const tx = new FundingTransaction({
                signer: signerA,
                network,
                utxos: [utxo],
                to: recipient,
                amount: TransactionBuilder.MINIMUM_DUST,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            // Fee estimation exercises the dummy-witness path for CSV multisig.
            const fee = await tx.estimateTransactionFees();
            expect(fee).toBeGreaterThan(0n);

            const signed = await tx.signTransaction();

            // Input 0 must carry a CSV-compatible sequence + the tapscript/controlBlock witness.
            expect(signed.ins.length).toBe(1);
            expect(signed.ins[0]!.sequence & 0xffff).toBe(addr.config.csvBlocks);
            expect((signed.ins[0]!.sequence >>> 31) & 1).toBe(0);

            const w = signed.ins[0]!.witness;
            expect(w.length).toBe(addr.config.pubkeys.length + 2);
            expect(w[w.length - 2]).toEqual(addr.tapscript);
            expect(w[w.length - 1]).toEqual(addr.controlBlock);
            // Top-of-stack Schnorr sig for the sole pubkey
            expect(w[0]!.length).toBe(64);
        });
    });

    /**
     * Regression: several builders (InteractionTransaction, CustomScriptTransaction,
     * CancelTransaction, etc.) set `this.tapLeafScript` to carry their contract
     * leaf, and the generic generatePsbtInputExtended writes that leaf onto
     * input 0 unconditionally. For a CSV multisig UTXO at input 0 that clobbers
     * the script-path setup we did earlier in the same call. The fix guards the
     * write with `!this.csvMultisigInputs.has(i)`.
     */
    describe('clobber regression', () => {
        // Minimal subclass that lets the test inject `tapLeafScript` before
        // addInputsFromUTXO runs, and read the resulting PSBT inputs back out.
        class ClobberProbe extends FundingTransaction {
            public setContractLeaf(leaf: TapLeafScript): void {
                (this as unknown as { tapLeafScript: TapLeafScript }).tapLeafScript = leaf;
            }

            public input0(): PsbtInputExtended {
                const inputs = (
                    this as unknown as { getInputs: () => PsbtInputExtended[] }
                ).getInputs();
                if (!inputs[0]) throw new Error('no input 0');
                return inputs[0];
            }
        }

        it('CSV multisig UTXO at input 0 keeps its own tapLeafScript', async () => {
            const addr = buildAddr([signerA], 8, 1);
            const utxo = makeUtxo(addr, 500_000n);
            const recipient = payments.p2tr({
                internalPubkey: toXOnly(signerA.publicKey) as XOnlyPublicKey,
                network,
            }).address as string;

            // A bogus "contract leaf" that a sibling builder would inject.
            // If the clobber bug returned, input 0 would end up with this.
            const fakeContractLeaf: TapLeafScript = {
                leafVersion: 0xc0,
                script: new Uint8Array([0x51]), // OP_1 — deliberately wrong
                controlBlock: new Uint8Array(33).fill(0xc0),
            };

            const tx = new ClobberProbe({
                signer: signerA,
                network,
                utxos: [utxo],
                to: recipient,
                amount: TransactionBuilder.MINIMUM_DUST,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            tx.setContractLeaf(fakeContractLeaf);

            // Trigger buildTransaction → addInputsFromUTXO → generatePsbtInputExtended.
            await tx.generateTransactionMinimalSignatures();

            const input = tx.input0();
            expect(input.tapLeafScript).toBeDefined();
            expect(input.tapLeafScript!.length).toBe(1);

            const leaf = input.tapLeafScript![0]!;
            // The CSV multisig setup must survive; the fake leaf must NOT be here.
            expect(leaf.script).toEqual(addr.tapscript);
            expect(leaf.controlBlock).toEqual(addr.controlBlock);
            expect(leaf.script).not.toEqual(fakeContractLeaf.script);

            // nSequence must still encode the CSV block count.
            expect((input.sequence as number) & 0xffff).toBe(addr.config.csvBlocks);
        });

        it('non-CSV P2TR input 0 still receives the contract leaf (no regression)', async () => {
            const p2tr = payments.p2tr({
                internalPubkey: toXOnly(signerA.publicKey) as XOnlyPublicKey,
                network,
            });
            const plainUtxo: UTXO = {
                transactionId: 'cd'.repeat(32),
                outputIndex: 0,
                value: 500_000n,
                scriptPubKey: {
                    hex: toHex(p2tr.output!),
                    address: p2tr.address as string,
                },
            };

            const fakeContractLeaf: TapLeafScript = {
                leafVersion: 0xc0,
                script: new Uint8Array([0x51, 0xac]), // OP_1 OP_CHECKSIG
                controlBlock: new Uint8Array(33).fill(0xc0),
            };

            const tx = new ClobberProbe({
                signer: signerA,
                network,
                utxos: [plainUtxo],
                to: p2tr.address as string,
                amount: TransactionBuilder.MINIMUM_DUST,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            tx.setContractLeaf(fakeContractLeaf);

            await tx.generateTransactionMinimalSignatures();

            const input = tx.input0();
            expect(input.tapLeafScript).toBeDefined();
            expect(input.tapLeafScript!.length).toBe(1);
            expect(input.tapLeafScript![0]!.script).toEqual(fakeContractLeaf.script);
        });
    });
});
