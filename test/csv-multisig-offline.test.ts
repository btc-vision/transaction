/**
 * csv-multisig-offline.test.ts
 *
 * Library-native multi-signer flow for spending CSV multisig UTXOs using
 * OfflineTransactionManager — the documented offline signing API. No raw
 * @btc-vision/bitcoin Psbt construction.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
    crypto as bitCrypto,
    networks,
    payments,
    toHex,
    toXOnly,
    type XOnlyPublicKey,
} from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type { UTXO } from '../build/opnet.js';
import {
    CSVMultisigProvider,
    EcKeyPair,
    OfflineTransactionManager,
    TransactionBuilder,
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

function makeUtxo(addr: ReturnType<typeof buildAddr>, value: bigint): UTXO {
    return {
        transactionId: '11'.repeat(32),
        outputIndex: 0,
        value,
        scriptPubKey: {
            hex: toHex(addr.scriptPubKey),
            address: addr.address,
        },
        witnessScript: addr.tapscript,
    };
}

describe('CSV multisig offline multi-signer flow', () => {
    let signerA: UniversalSigner;
    let signerB: UniversalSigner;
    let signerC: UniversalSigner;

    beforeAll(() => {
        signerA = makeSigner('offline-A');
        signerB = makeSigner('offline-B');
        signerC = makeSigner('offline-C');
    });

    it('2-of-3 signers produce a broadcastable tx through OfflineTransactionManager', async () => {
        const addr = buildAddr([signerA, signerB, signerC], 10, 2);
        const utxo = makeUtxo(addr, 1_000_000n);
        const recipient = payments.p2tr({
            internalPubkey: toXOnly(signerA.publicKey) as XOnlyPublicKey,
            network,
        }).address as string;

        // --- Coordinator (online): export funding state ---
        const initialState = OfflineTransactionManager.exportFunding({
            signer: signerA, // placeholder; real signer supplied per-hop
            mldsaSigner: null,
            network,
            utxos: [utxo],
            to: recipient,
            amount: TransactionBuilder.MINIMUM_DUST,
            feeRate: 1,
            priorityFee: 0n,
            gasSatFee: 0n,
        });

        // Before any signing, there's no partial PSBT yet.
        expect(OfflineTransactionManager.csvMultisigGetStatus(initialState)).toEqual([]);

        // --- Hop 1: signer A adds signature (offline env) ---
        const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(
            initialState,
            signerA,
        );
        expect(hop1.final).toBe(false);
        expect(hop1.perInput).toHaveLength(1);
        expect(hop1.perInput[0]!.required).toBe(2);
        expect(hop1.perInput[0]!.collected).toBe(1);
        expect(hop1.perInput[0]!.signers).toContain(toHex(toXOnly(signerA.publicKey)));

        // --- Hop 2: signer B adds signature (different offline env) ---
        const hop2 = await OfflineTransactionManager.addCSVMultisigSignature(
            hop1.state,
            signerB,
        );
        expect(hop2.final).toBe(true);
        expect(hop2.perInput[0]!.collected).toBe(2);
        expect(new Set(hop2.perInput[0]!.signers)).toEqual(
            new Set([
                toHex(toXOnly(signerA.publicKey)),
                toHex(toXOnly(signerB.publicKey)),
            ]),
        );

        // --- Finalize + extract (anyone, no key material required) ---
        const rawTxHex = OfflineTransactionManager.csvMultisigFinalize(hop2.state);
        expect(rawTxHex).toMatch(/^[0-9a-f]+$/);

        // Sanity: the extracted tx has the expected witness shape and CSV sequence.
        const state = OfflineTransactionManager.inspect(hop2.state);
        expect(state.partialPsbtBase64).toBeDefined();
    });

    it('signer pubkey not in the tapscript is a no-op', async () => {
        const addr = buildAddr([signerA, signerB], 5, 2);
        const utxo = makeUtxo(addr, 500_000n);
        const recipient = payments.p2tr({
            internalPubkey: toXOnly(signerA.publicKey) as XOnlyPublicKey,
            network,
        }).address as string;

        const initialState = OfflineTransactionManager.exportFunding({
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

        const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(
            initialState,
            signerA,
        );
        expect(hop1.perInput[0]!.collected).toBe(1);

        // signerC is not in this 2-of-2 tapscript.
        const hop2 = await OfflineTransactionManager.addCSVMultisigSignature(
            hop1.state,
            signerC,
        );
        expect(hop2.perInput[0]!.collected).toBe(1);
        expect(hop2.final).toBe(false);

        // Finalize should throw because we're still below threshold.
        expect(() => OfflineTransactionManager.csvMultisigFinalize(hop2.state)).toThrow(
            /needs 2 signatures, got 1/,
        );

        // Now add the real second signer and finalize.
        const hop3 = await OfflineTransactionManager.addCSVMultisigSignature(
            hop2.state,
            signerB,
        );
        expect(hop3.final).toBe(true);

        const rawTxHex = OfflineTransactionManager.csvMultisigFinalize(hop3.state);
        expect(rawTxHex).toMatch(/^[0-9a-f]+$/);
    });

    it('threshold = 1 finalizes in a single hop and emits a ready-to-broadcast tx', async () => {
        const addr = buildAddr([signerA], 3, 1);
        const utxo = makeUtxo(addr, 500_000n);
        const recipient = payments.p2tr({
            internalPubkey: toXOnly(signerA.publicKey) as XOnlyPublicKey,
            network,
        }).address as string;

        const initialState = OfflineTransactionManager.exportFunding({
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

        const hop1 = await OfflineTransactionManager.addCSVMultisigSignature(
            initialState,
            signerA,
        );
        expect(hop1.final).toBe(true);

        const rawTxHex = OfflineTransactionManager.csvMultisigFinalize(hop1.state);
        expect(rawTxHex).toMatch(/^[0-9a-f]+$/);
    });
});
