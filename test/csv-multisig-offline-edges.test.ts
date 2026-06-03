/**
 * csv-multisig-offline-edges.test.ts
 *
 * Edge cases for the OfflineTransactionManager CSV multisig API:
 *   - csvMultisigGetStatus standalone
 *   - csvMultisigFinalize error paths
 *   - addCSVMultisigSignature idempotency + non-cosigner no-op on first hop
 *   - Serializer v2 round-trip of partialPsbtBase64
 *   - signPSBT returns a partial PSBT for under-threshold CSV inputs
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
    crypto as bitCrypto,
    networks,
    payments,
    Psbt,
    toHex,
    toXOnly,
    type XOnlyPublicKey,
} from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type { UTXO } from '../build/opnet.js';
import {
    CSVMultisigProvider,
    EcKeyPair,
    FundingTransaction,
    OfflineTransactionManager,
    TransactionBuilder,
    TransactionSerializer,
} from '../build/opnet.js';

const network = networks.regtest;

function makeSigner(seed: string): UniversalSigner {
    return EcKeyPair.fromPrivateKey(
        bitCrypto.sha256(new TextEncoder().encode(seed)),
        network,
    );
}

function buildAddr(signers: UniversalSigner[], csvBlocks: number, threshold: number) {
    const pubkeys = signers.map((s) => toXOnly(s.publicKey) as XOnlyPublicKey);
    return CSVMultisigProvider.generateAddress({ pubkeys, threshold, csvBlocks }, network);
}

function makeUtxo(
    addr: ReturnType<typeof buildAddr>,
    value: bigint,
    txid: string = '22'.repeat(32),
): UTXO {
    return {
        transactionId: txid,
        outputIndex: 0,
        value,
        scriptPubKey: {
            hex: toHex(addr.scriptPubKey),
            address: addr.address,
        },
        witnessScript: addr.tapscript,
    };
}

function fundingState(
    addr: ReturnType<typeof buildAddr>,
    utxo: UTXO,
    placeholderSigner: UniversalSigner,
): string {
    const recipient = payments.p2tr({
        internalPubkey: toXOnly(placeholderSigner.publicKey) as XOnlyPublicKey,
        network,
    }).address as string;

    return OfflineTransactionManager.exportFunding({
        signer: placeholderSigner,
        mldsaSigner: null,
        network,
        utxos: [utxo],
        to: recipient,
        amount: TransactionBuilder.MINIMUM_DUST,
        feeRate: 1,
        priorityFee: 0n,
        gasSatFee: 0n,
    });
}

describe('OfflineTransactionManager CSV multisig — edges', () => {
    let signerA: UniversalSigner;
    let signerB: UniversalSigner;
    let signerC: UniversalSigner;
    let signerD: UniversalSigner; // never a cosigner anywhere

    beforeAll(() => {
        signerA = makeSigner('edges-A');
        signerB = makeSigner('edges-B');
        signerC = makeSigner('edges-C');
        signerD = makeSigner('edges-D');
    });

    // ----------------------------------------------------------------
    // csvMultisigGetStatus
    // ----------------------------------------------------------------
    describe('csvMultisigGetStatus', () => {
        it('returns [] when no partial PSBT has been produced yet', () => {
            const addr = buildAddr([signerA, signerB], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            expect(OfflineTransactionManager.csvMultisigGetStatus(state)).toEqual([]);
        });

        it('reflects the same status as the hop result after addCSVMultisigSignature', async () => {
            const addr = buildAddr([signerA, signerB, signerC], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(state, signerA);
            const direct = OfflineTransactionManager.csvMultisigGetStatus(hop1.state);

            expect(direct).toEqual(hop1.perInput);
            expect(direct[0]!.collected).toBe(1);
            expect(direct[0]!.required).toBe(2);
        });

        it('reports collected === threshold for finalized inputs (threshold=1 single hop)', async () => {
            const addr = buildAddr([signerA], 3, 1);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(state, signerA);

            const status = OfflineTransactionManager.csvMultisigGetStatus(hop1.state);
            expect(status).toHaveLength(1);
            expect(status[0]!.required).toBe(1);
            expect(status[0]!.collected).toBe(1);
        });
    });

    // ----------------------------------------------------------------
    // csvMultisigFinalize error paths
    // ----------------------------------------------------------------
    describe('csvMultisigFinalize', () => {
        it('throws when no partial PSBT exists in state', () => {
            const addr = buildAddr([signerA, signerB], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            expect(() => OfflineTransactionManager.csvMultisigFinalize(state)).toThrow(
                /No partial PSBT/i,
            );
        });

        it('throws when the partial PSBT is below threshold', async () => {
            const addr = buildAddr([signerA, signerB, signerC], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(state, signerA);
            expect(hop1.final).toBe(false);

            expect(() => OfflineTransactionManager.csvMultisigFinalize(hop1.state)).toThrow(
                /needs 2 signatures, got 1/,
            );
        });
    });

    // ----------------------------------------------------------------
    // addCSVMultisigSignature edge cases
    // ----------------------------------------------------------------
    describe('addCSVMultisigSignature', () => {
        it('is idempotent — re-signing with the same cosigner does not double-count', async () => {
            const addr = buildAddr([signerA, signerB, signerC], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(state, signerA);
            expect(hop1.perInput[0]!.collected).toBe(1);

            const hop2 = await OfflineTransactionManager.addCSVMultisigSignature(
                hop1.state,
                signerA,
            );
            expect(hop2.perInput[0]!.collected).toBe(1);
            expect(hop2.final).toBe(false);
        });

        it('non-cosigner on a non-first hop leaves the partial PSBT unchanged', async () => {
            const addr = buildAddr([signerA, signerB], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(state, signerA);
            expect(hop1.perInput[0]!.collected).toBe(1);

            // signerD is in neither the tapscript nor the original signer slot
            const hop2 = await OfflineTransactionManager.addCSVMultisigSignature(
                hop1.state,
                signerD,
            );
            expect(hop2.perInput[0]!.collected).toBe(1);
            expect(hop2.final).toBe(false);
        });

        it('reaches threshold across three distinct cosigners (2-of-3 with C+B)', async () => {
            const addr = buildAddr([signerA, signerB, signerC], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            // Placeholder signer is A — but the actual cosigners are C then B.
            const state = fundingState(addr, utxo, signerA);

            // Build PSBT using A as the placeholder for the first hop;
            // immediately overlay C's signature in a second hop.
            const hopA = await OfflineTransactionManager.addCSVMultisigSignature(state, signerA);
            expect(hopA.perInput[0]!.collected).toBe(1);

            const hopC = await OfflineTransactionManager.addCSVMultisigSignature(
                hopA.state,
                signerC,
            );
            expect(hopC.perInput[0]!.collected).toBe(2);
            expect(hopC.final).toBe(true);

            // Finalization succeeds even though signerB never participated.
            const rawTxHex = OfflineTransactionManager.csvMultisigFinalize(hopC.state);
            expect(rawTxHex).toMatch(/^[0-9a-f]+$/);
        });
    });

    // ----------------------------------------------------------------
    // Serializer v2 round-trip
    // ----------------------------------------------------------------
    describe('serializer v2 — partialPsbtBase64 round-trip', () => {
        it('omits the field on a freshly exported state', () => {
            const addr = buildAddr([signerA, signerB], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            const decoded = TransactionSerializer.fromBase64(state);
            expect(decoded.partialPsbtBase64).toBeUndefined();
        });

        it('round-trips the partial PSBT verbatim after a signing hop', async () => {
            const addr = buildAddr([signerA, signerB], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const state = fundingState(addr, utxo, signerA);

            const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(state, signerA);

            const decoded = TransactionSerializer.fromBase64(hop1.state);
            expect(decoded.partialPsbtBase64).toBeDefined();

            // Sanity: the carried PSBT actually parses and has one tapScriptSig.
            const psbt = Psbt.fromBase64(decoded.partialPsbtBase64!, { network });
            expect(psbt.data.inputs[0]!.tapScriptSig).toHaveLength(1);

            // Round-trip via toBase64 yields a byte-identical payload.
            const reEncoded = TransactionSerializer.toBase64(decoded);
            expect(reEncoded).toBe(hop1.state);
        });
    });

    // ----------------------------------------------------------------
    // signPSBT semantic shift: returns the (possibly partial) PSBT
    // ----------------------------------------------------------------
    describe('TransactionBuilder.signPSBT — partial PSBT semantics', () => {
        it('returns a PSBT with the tapScriptSig but no finalScriptWitness for under-threshold CSV input', async () => {
            const addr = buildAddr([signerA, signerB, signerC], 5, 2);
            const utxo = makeUtxo(addr, 200_000n);
            const recipient = payments.p2tr({
                internalPubkey: toXOnly(signerA.publicKey) as XOnlyPublicKey,
                network,
            }).address as string;

            const tx = new FundingTransaction({
                signer: signerA,
                mldsaSigner: null,
                network,
                utxos: [utxo],
                to: recipient,
                amount: TransactionBuilder.MINIMUM_DUST,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
            });

            const psbt = await tx.signPSBT();
            const input = psbt.data.inputs[0]!;

            expect(input.tapScriptSig).toBeDefined();
            expect(input.tapScriptSig).toHaveLength(1);
            expect(input.finalScriptWitness).toBeUndefined();
        });
    });
});
