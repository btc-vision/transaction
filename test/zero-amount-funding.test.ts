import { beforeAll, describe, expect, it } from 'vitest';
import { networks, payments, toHex, toXOnly, Transaction } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type { IChallengeSolution, IChallengeVerification, UTXO } from '../build/opnet.js';
import {
    Address,
    EcKeyPair,
    FundingTransaction,
    MLDSASecurityLevel,
    Mnemonic,
    TransactionBuilder,
    TransactionFactory,
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

/**
 * Create a UTXO with a full nonWitnessUtxo (required for optional inputs
 * that the interaction transaction will consume).
 */
function createUtxoWithWitness(
    addr: string,
    value: bigint,
    signer: UniversalSigner,
    txId: string = '1'.repeat(64),
    index: number = 0,
): UTXO {
    // Build a minimal valid transaction that pays to addr
    const tx = new Transaction();
    const p2tr = payments.p2tr({ address: addr, network });
    tx.addOutput(p2tr.output as Uint8Array, value);

    return {
        transactionId: txId,
        outputIndex: index,
        value,
        scriptPubKey: {
            hex: toHex(p2tr.output as Uint8Array),
            address: addr,
        },
        nonWitnessUtxo: tx.toBuffer(),
    };
}

function createMockChallenge(publicKey: Address): IChallengeSolution {
    const verification: IChallengeVerification = {
        epochHash: new Uint8Array(32),
        epochRoot: new Uint8Array(32),
        targetHash: new Uint8Array(32),
        targetChecksum: new Uint8Array(32),
        startBlock: 0n,
        endBlock: 100n,
        proofs: [],
    };

    return {
        epochNumber: 1n,
        publicKey,
        solution: new Uint8Array(32),
        salt: new Uint8Array(32),
        graffiti: new Uint8Array(32),
        difficulty: 1,
        verification,
        verifySubmissionSignature: () => true,
        getSubmission: () => undefined,
        toRaw: () => ({
            epochNumber: '1',
            mldsaPublicKey: '',
            legacyPublicKey: '',
            solution: '00'.repeat(32),
            salt: '00'.repeat(32),
            graffiti: '00'.repeat(32),
            difficulty: 1,
            verification: {
                epochHash: '00'.repeat(32),
                epochRoot: '00'.repeat(32),
                targetHash: '00'.repeat(32),
                targetChecksum: '00'.repeat(32),
                startBlock: '0',
                endBlock: '100',
                proofs: [],
            },
        }),
        verify: () => true,
        toBuffer: () => new Uint8Array(0),
        toHex: () => '',
        calculateSolution: () => new Uint8Array(32),
        checkDifficulty: () => ({ valid: true, difficulty: 1 }),
        getMiningTargetBlock: () => null,
    };
}

describe('Zero-amount funding bug', () => {
    let signer: UniversalSigner;
    let taprootAddress: string;
    let walletAddress: Address;

    beforeAll(() => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        signer = wallet.keypair;
        walletAddress = wallet.address;
        taprootAddress = wallet.p2tr;
    });

    describe('FundingTransaction with zero amount', () => {
        it('should throw "Output value is 0" when amount is 0n (root cause)', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);

            const tx = new FundingTransaction({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                amount: 0n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            await expect(tx.signTransaction()).rejects.toThrow(
                /Output value is 0 and no script provided/,
            );
        });

        it('should succeed when amount is MINIMUM_DUST (330 sats)', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);

            const tx = new FundingTransaction({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                amount: TransactionBuilder.MINIMUM_DUST,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            const signed = await tx.signTransaction();
            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);

            // The primary output should be at least MINIMUM_DUST
            const outputValues = signed.outs.map((o) => BigInt(o.value));
            expect(outputValues.some((v) => v >= TransactionBuilder.MINIMUM_DUST)).toBe(true);
        });
    });

    describe('TransactionFactory.signInteraction with subtractExtraUTXOFromAmountRequired', () => {
        it('should not throw when optional inputs fully cover costs', async () => {
            const contract = '0x' + '00'.repeat(32);

            // Primary UTXO for the wallet (used by funding tx)
            const walletUtxo = createTaprootUtxo(taprootAddress, 500_000n);

            // Optional input with a very large value that covers all costs
            const optionalInput = createUtxoWithWitness(
                taprootAddress,
                10_000_000n,
                signer,
                'ab'.repeat(32),
                0,
            );

            const factory = new TransactionFactory();
            const challenge = createMockChallenge(walletAddress);

            // This should NOT throw — the fix clamps to MINIMUM_DUST
            const result = await factory.signInteraction({
                signer,
                network,
                utxos: [walletUtxo],
                to: taprootAddress,
                from: taprootAddress,
                calldata: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
                challenge,
                contract,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: null,
                optionalInputs: [optionalInput],
                subtractExtraUTXOFromAmountRequired: true,
            });

            expect(result).toBeDefined();
            expect(result.interactionTransaction).toBeTruthy();
            expect(result.fundingTransaction).toBeTruthy();
        });

        it('should not throw when optional inputs partially cover costs', async () => {
            const contract = '0x' + '00'.repeat(32);

            const walletUtxo = createTaprootUtxo(taprootAddress, 500_000n);

            // Optional input with a small value (partial coverage)
            const optionalInput = createUtxoWithWitness(
                taprootAddress,
                500n,
                signer,
                'cd'.repeat(32),
                0,
            );

            const factory = new TransactionFactory();
            const challenge = createMockChallenge(walletAddress);

            const result = await factory.signInteraction({
                signer,
                network,
                utxos: [walletUtxo],
                to: taprootAddress,
                from: taprootAddress,
                calldata: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
                challenge,
                contract,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: null,
                optionalInputs: [optionalInput],
                subtractExtraUTXOFromAmountRequired: true,
            });

            expect(result).toBeDefined();
            expect(result.interactionTransaction).toBeTruthy();
            expect(result.fundingTransaction).toBeTruthy();
        });

        it('should work normally without subtractExtraUTXOFromAmountRequired', async () => {
            const contract = '0x' + '00'.repeat(32);

            const walletUtxo = createTaprootUtxo(taprootAddress, 500_000n);

            const factory = new TransactionFactory();
            const challenge = createMockChallenge(walletAddress);

            const result = await factory.signInteraction({
                signer,
                network,
                utxos: [walletUtxo],
                to: taprootAddress,
                from: taprootAddress,
                calldata: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
                challenge,
                contract,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: null,
            });

            expect(result).toBeDefined();
            expect(result.interactionTransaction).toBeTruthy();
            expect(result.fundingTransaction).toBeTruthy();
        });

        it('should work with empty optional inputs and subtractExtraUTXOFromAmountRequired', async () => {
            const contract = '0x' + '00'.repeat(32);

            const walletUtxo = createTaprootUtxo(taprootAddress, 500_000n);

            const factory = new TransactionFactory();
            const challenge = createMockChallenge(walletAddress);

            const result = await factory.signInteraction({
                signer,
                network,
                utxos: [walletUtxo],
                to: taprootAddress,
                from: taprootAddress,
                calldata: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
                challenge,
                contract,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: null,
                optionalInputs: [],
                subtractExtraUTXOFromAmountRequired: true,
            });

            expect(result).toBeDefined();
            expect(result.interactionTransaction).toBeTruthy();
            expect(result.fundingTransaction).toBeTruthy();
        });
    });
});
