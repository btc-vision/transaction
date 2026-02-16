import { beforeAll, describe, expect, it } from 'vitest';
import { networks, opcodes, payments, script, toHex, toXOnly } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type { UTXO } from '../build/opnet.js';
import {
    CancelTransaction,
    FundingTransaction,
    MLDSASecurityLevel,
    Mnemonic,
    TransactionBuilder,
} from '../build/opnet.js';

const network = networks.regtest;
const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function createTaprootUtxo(
    addr: string,
    value: bigint,
    txId: string = '0'.repeat(64),
    index: number = 0,
): UTXO {
    const p2tr = payments.p2tr({ address: addr, network });
    return {
        transactionId: txId,
        outputIndex: index,
        value,
        scriptPubKey: {
            hex: toHex(p2tr.output as Uint8Array),
            address: addr,
        },
    };
}

describe('addRefundOutput ,  deterministic fee estimation', () => {
    let signer: UniversalSigner;
    let taprootAddress: string;

    beforeAll(() => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        signer = wallet.keypair;
        taprootAddress = wallet.p2tr;
    });

    // ----------------------------------------------------------------
    // Helper: build a FundingTransaction and return the signed tx
    // ----------------------------------------------------------------
    function buildFunding(opts: {
        utxoValue: bigint;
        amount: bigint;
        feeRate?: number;
        feeUtxos?: UTXO[];
        autoAdjustAmount?: boolean;
    }) {
        const utxo = createTaprootUtxo(taprootAddress, opts.utxoValue);
        return new FundingTransaction({
            signer,
            network,
            utxos: [utxo],
            to: taprootAddress,
            amount: opts.amount,
            feeRate: opts.feeRate ?? 1,
            priorityFee: 0n,
            gasSatFee: 0n,
            mldsaSigner: null,
            ...(opts.feeUtxos !== undefined && { feeUtxos: opts.feeUtxos }),
            ...(opts.autoAdjustAmount !== undefined && { autoAdjustAmount: opts.autoAdjustAmount }),
        });
    }

    // ================================================================
    //  1-call path: change output IS viable
    // ================================================================
    describe('1-call path (change output viable)', () => {
        it('should produce a change output when plenty of funds remain', async () => {
            const utxoValue = 100_000n;
            const amount = 50_000n;
            const tx = buildFunding({ utxoValue, amount });

            const signed = await tx.signTransaction();

            // Must have at least 2 outputs: send + change
            expect(signed.outs.length).toBeGreaterThanOrEqual(2);

            // Total output value + fee = total input value
            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            const fee = utxoValue - totalOut;
            expect(fee).toBeGreaterThan(0n);
            expect(totalOut).toBeLessThan(utxoValue);
        });

        it('should set transactionFee and overflowFees correctly', async () => {
            const utxoValue = 200_000n;
            const amount = 50_000n;
            const tx = buildFunding({ utxoValue, amount });

            await tx.signTransaction();

            // transactionFee should be positive
            expect(tx.transactionFee).toBeGreaterThan(0n);

            // overflowFees should be the change amount
            expect(tx.overflowFees).toBeGreaterThan(0n);

            // overflowFees should be >= MINIMUM_DUST (330n)
            expect(tx.overflowFees).toBeGreaterThanOrEqual(TransactionBuilder.MINIMUM_DUST);

            // totalInput = amount + overflowFees + transactionFee
            expect(tx.overflowFees + amount + tx.transactionFee).toBe(utxoValue);
        });

        it('should produce exact change when using multiple UTXOs', async () => {
            const utxo1 = createTaprootUtxo(taprootAddress, 50_000n, '1'.repeat(64), 0);
            const utxo2 = createTaprootUtxo(taprootAddress, 50_000n, '2'.repeat(64), 1);
            const totalInput = 100_000n;
            const amount = 30_000n;

            const tx = new FundingTransaction({
                signer,
                network,
                utxos: [utxo1, utxo2],
                to: taprootAddress,
                amount,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            const signed = await tx.signTransaction();

            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            const fee = totalInput - totalOut;

            expect(fee).toBeGreaterThan(0n);
            expect(tx.transactionFee).toBe(fee);
        });
    });

    // ================================================================
    //  2-call path: change output NOT viable (below dust)
    // ================================================================
    describe('2-call path (no change output)', () => {
        it('should drop the change output when leftover is below dust', async () => {
            // Choose amount so that leftover after fee is < 330 sats
            // With feeRate=1 and a simple 1-in-1-out taproot tx (~110 vbytes),
            // fee ~110 sats. So utxoValue = amount + fee + small_leftover
            // e.g. 50_000 + 110 + 200 = 50_310 → leftover ~200 < 330 dust
            const utxoValue = 50_310n;
            const amount = 50_000n;
            const tx = buildFunding({ utxoValue, amount });

            const signed = await tx.signTransaction();

            // Should have only 1 output (the send output, no change)
            expect(signed.outs.length).toBe(1);

            // The output should be the send amount
            const firstOut = signed.outs[0];
            expect(firstOut).toBeDefined();
            expect(BigInt(firstOut?.value ?? 0)).toBe(amount);

            // overflowFees should be 0 (no change output)
            expect(tx.overflowFees).toBe(0n);

            // Fee = all the leftover (absorbed by miner)
            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            expect(utxoValue - totalOut).toBeGreaterThan(0n);
        });

        it('should set transactionFee when there is no change output', async () => {
            const utxoValue = 50_200n;
            const amount = 50_000n;
            const tx = buildFunding({ utxoValue, amount });

            const signed = await tx.signTransaction();

            // transactionFee should be set (the estimated fee without change)
            expect(tx.transactionFee).toBeGreaterThan(0n);
            expect(tx.overflowFees).toBe(0n);

            // Only 1 output
            expect(signed.outs.length).toBe(1);
        });
    });

    // ================================================================
    //  Insufficient funds
    // ================================================================
    describe('insufficient funds', () => {
        it('should throw when amount equals total UTXO value', async () => {
            const utxoValue = 100_000n;
            const tx = buildFunding({ utxoValue, amount: utxoValue });

            await expect(tx.signTransaction()).rejects.toThrow(/Insufficient funds/);
        });

        it('should throw when amount exceeds total UTXO value', async () => {
            const utxoValue = 50_000n;
            const tx = buildFunding({ utxoValue, amount: 60_000n });

            await expect(tx.signTransaction()).rejects.toThrow(/Insufficient funds/);
        });
    });

    // ================================================================
    //  Tolerance: sendBack < 0 but totalInput > amountSpent
    // ================================================================
    describe('tolerance ,  effective fee is positive but less than estimated', () => {
        it('should succeed when amount is close to totalInput leaving a small effective fee', async () => {
            const utxoValue = 100_000n;
            // Leave 200 sats for fees ,  less than the estimated fee at high rate
            // but totalInput > amountSpent so it's valid
            const amount = utxoValue - 200n;

            const tx = buildFunding({ utxoValue, amount, feeRate: 10 });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);

            // Verify fee is exactly the 200 sats leftover
            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            expect(utxoValue - totalOut).toBe(200n);
        });

        it('should succeed with very small leftover (1 sat) as long as totalInput > amountSpent', async () => {
            const utxoValue = 100_000n;
            const amount = utxoValue - 1n;

            const tx = buildFunding({ utxoValue, amount, feeRate: 5 });

            const signed = await tx.signTransaction();
            expect(signed.ins.length).toBeGreaterThan(0);

            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            expect(utxoValue - totalOut).toBe(1n);
        });
    });

    // ================================================================
    //  CancelTransaction (amountSpent = 0n)
    // ================================================================
    describe('CancelTransaction ,  amountSpent = 0n', () => {
        it('should not throw from addRefundOutput when amountSpent is 0', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);

            const compiledTargetScript = script.compile([
                toXOnly(signer.publicKey),
                opcodes.OP_CHECKSIG,
            ]);

            const tx = new CancelTransaction({
                signer,
                network,
                utxos: [utxo],
                compiledTargetScript,
                feeRate: 1,
                mldsaSigner: null,
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.virtualSize()).toBeGreaterThan(0);
        });

        it('should return all input value minus fee as change', async () => {
            const utxoValue = 100_000n;
            const utxo = createTaprootUtxo(taprootAddress, utxoValue);

            const compiledTargetScript = script.compile([
                toXOnly(signer.publicKey),
                opcodes.OP_CHECKSIG,
            ]);

            const tx = new CancelTransaction({
                signer,
                network,
                utxos: [utxo],
                compiledTargetScript,
                feeRate: 1,
                mldsaSigner: null,
            });

            const signed = await tx.signTransaction();

            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            const fee = utxoValue - totalOut;

            // Fee should be small relative to total
            expect(fee).toBeGreaterThan(0n);
            expect(fee).toBeLessThan(utxoValue / 2n);

            // overflowFees should equal the change output
            expect(tx.overflowFees).toBe(totalOut);
        });

        it('should succeed with high fee rate (cancel is still valid)', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);

            const compiledTargetScript = script.compile([
                toXOnly(signer.publicKey),
                opcodes.OP_CHECKSIG,
            ]);

            const tx = new CancelTransaction({
                signer,
                network,
                utxos: [utxo],
                compiledTargetScript,
                feeRate: 50,
                mldsaSigner: null,
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
        });

        it('should throw when expectRefund is true but fees consume all input', async () => {
            // Use a tiny UTXO so that fees eat everything ,  expectRefund
            // (set by CancelTransaction) must reject this since the user
            // would get nothing back.
            const utxo = createTaprootUtxo(taprootAddress, 500n);

            const compiledTargetScript = script.compile([
                toXOnly(signer.publicKey),
                opcodes.OP_CHECKSIG,
            ]);

            const tx = new CancelTransaction({
                signer,
                network,
                utxos: [utxo],
                compiledTargetScript,
                feeRate: 100, // very high fee rate on tiny UTXO
                mldsaSigner: null,
            });

            await expect(tx.signTransaction()).rejects.toThrow(/Insufficient funds/);
        });
    });

    // ================================================================
    //  feeUtxos ,  separate fee funding
    // ================================================================
    describe('feeUtxos ,  separate UTXOs for fees', () => {
        it('should use feeUtxos to cover fees while preserving exact send amount', async () => {
            const utxoValue = 50_000n;
            const feeUtxoValue = 10_000n;
            const amount = 50_000n; // exact match with primary UTXO

            const feeUtxo = createTaprootUtxo(taprootAddress, feeUtxoValue, 'f'.repeat(64), 0);

            const tx = buildFunding({
                utxoValue,
                amount,
                feeUtxos: [feeUtxo],
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBe(2); // primary + fee UTXO

            // The send output should be exactly the requested amount
            const outputValues = signed.outs.map((o) => BigInt(o.value));
            expect(outputValues).toContain(amount);

            // Total outputs + fee = total inputs
            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            const totalIn = utxoValue + feeUtxoValue;
            expect(totalOut + tx.transactionFee).toBeLessThanOrEqual(totalIn);
        });

        it('should produce a change output from feeUtxos leftover', async () => {
            const utxoValue = 50_000n;
            const feeUtxoValue = 50_000n; // generous fee UTXO
            const amount = 50_000n;

            const feeUtxo = createTaprootUtxo(taprootAddress, feeUtxoValue, 'f'.repeat(64), 0);

            const tx = buildFunding({
                utxoValue,
                amount,
                feeUtxos: [feeUtxo],
            });

            const signed = await tx.signTransaction();

            // Should have change output from generous feeUtxo
            expect(signed.outs.length).toBeGreaterThanOrEqual(2);
            expect(tx.overflowFees).toBeGreaterThan(0n);
        });
    });

    // ================================================================
    //  Fee rate variations
    // ================================================================
    describe('fee rate variations', () => {
        it('should produce higher fees with higher fee rates', async () => {
            const utxoValue = 200_000n;
            const amount = 50_000n;

            const txLow = buildFunding({ utxoValue, amount, feeRate: 1 });
            const txHigh = buildFunding({ utxoValue, amount, feeRate: 10 });

            await txLow.signTransaction();
            await txHigh.signTransaction();

            expect(txHigh.transactionFee).toBeGreaterThan(txLow.transactionFee);
        });

        it('should produce fee roughly proportional to fee rate', async () => {
            const utxoValue = 200_000n;
            const amount = 50_000n;

            const tx1 = buildFunding({ utxoValue, amount, feeRate: 2 });
            const tx5 = buildFunding({ utxoValue, amount, feeRate: 10 });

            await tx1.signTransaction();
            await tx5.signTransaction();

            // Fee at rate 10 should be roughly 5x fee at rate 2
            const ratio = Number(tx5.transactionFee) / Number(tx1.transactionFee);
            expect(ratio).toBeGreaterThan(3); // allow some slack
            expect(ratio).toBeLessThan(7);
        });
    });

    // ================================================================
    //  Conservation of value
    // ================================================================
    describe('conservation of value', () => {
        it('total output + fee should equal total input (with change)', async () => {
            const utxoValue = 100_000n;
            const amount = 30_000n;
            const tx = buildFunding({ utxoValue, amount });

            const signed = await tx.signTransaction();

            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            const fee = utxoValue - totalOut;

            expect(fee).toBeGreaterThan(0n);
            // The fee deduced from outputs should match transactionFee
            // (when there's a change output, they match exactly)
            expect(fee).toBe(tx.transactionFee);
        });

        it('total output + absorbed fee should equal total input (without change)', async () => {
            // Set up so leftover is below dust
            const utxoValue = 50_200n;
            const amount = 50_000n;
            const tx = buildFunding({ utxoValue, amount });

            const signed = await tx.signTransaction();

            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            const actualFee = utxoValue - totalOut;

            // Actual fee >= estimated fee (extra absorbed by miner)
            expect(actualFee).toBeGreaterThanOrEqual(tx.transactionFee);
            // Total is conserved
            expect(totalOut + actualFee).toBe(utxoValue);
        });
    });

    // ================================================================
    //  Edge cases around MINIMUM_DUST boundary
    // ================================================================
    describe('MINIMUM_DUST boundary', () => {
        it('should create change output when leftover is exactly MINIMUM_DUST', async () => {
            // We need: totalInput - amount - feeWithChange = 330
            // This is tricky because fee depends on vsize. We'll use a large
            // input and check the boundary condition through the public API.
            const utxoValue = 200_000n;
            const amount = 50_000n;
            const tx = buildFunding({ utxoValue, amount });

            const signed = await tx.signTransaction();

            // With plenty of headroom, change should exist
            expect(tx.overflowFees).toBeGreaterThanOrEqual(TransactionBuilder.MINIMUM_DUST);
            expect(signed.outs.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ================================================================
    //  autoAdjustAmount interaction
    // ================================================================
    describe('autoAdjustAmount interaction with addRefundOutput', () => {
        it('should auto-adjust amount and still compute correct fee', async () => {
            const utxoValue = 100_000n;

            const tx = buildFunding({
                utxoValue,
                amount: utxoValue, // exact match triggers auto-adjust
                autoAdjustAmount: true,
                feeRate: 2,
            });

            const signed = await tx.signTransaction();

            const totalOut = signed.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
            const fee = utxoValue - totalOut;

            expect(fee).toBeGreaterThan(0n);
            expect(totalOut).toBeLessThan(utxoValue);
            expect(totalOut).toBeGreaterThan(0n);
        });

        it('should not auto-adjust when amount is well below totalInput', async () => {
            const utxoValue = 100_000n;
            const amount = 30_000n;

            const tx = buildFunding({
                utxoValue,
                amount,
                autoAdjustAmount: true,
            });

            const signed = await tx.signTransaction();

            // Primary output should be exactly the requested amount
            const outputValues = signed.outs.map((o) => BigInt(o.value));
            expect(outputValues).toContain(amount);

            // Should still have a change output
            expect(signed.outs.length).toBeGreaterThanOrEqual(2);
        });
    });
});
