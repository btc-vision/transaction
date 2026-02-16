import { beforeAll, describe, expect, it } from 'vitest';
import {
    networks,
    opcodes,
    payments,
    PaymentType,
    script,
    toHex,
    toXOnly,
    type P2MRPayment,
    type Taptree,
    type XOnlyPublicKey,
} from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type { QuantumBIP32Interface } from '@btc-vision/bip32';
import type { IChallengeSolution, IChallengeVerification, UTXO } from '../build/opnet.js';
import {
    Address,
    CancelTransaction,
    CustomScriptTransaction,
    DeploymentTransaction,
    EcKeyPair,
    InteractionTransaction,
    MLDSASecurityLevel,
    Mnemonic,
    MultiSignTransaction,
    P2MR_MS,
    P2TR_MS,
    TimeLockGenerator,
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
        toRaw: () => {
            throw new Error('Not implemented in mock');
        },
        verify: () => true,
        toBuffer: () => new Uint8Array(0),
        toHex: () => '',
        calculateSolution: () => new Uint8Array(32),
        checkDifficulty: () => ({ valid: true, difficulty: 1 }),
        getMiningTargetBlock: () => null,
    };
}

describe('P2MR Support', () => {
    let signer: UniversalSigner;
    let taprootAddress: string;
    let walletAddress: Address;
    let quantumRoot: QuantumBIP32Interface;

    beforeAll(() => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        signer = wallet.keypair;
        walletAddress = wallet.address;
        taprootAddress = wallet.p2tr;
        quantumRoot = mnemonic.getQuantumRoot();
    });

    describe('P2MR Address Generation', () => {
        it('should generate a P2MR multisig address via P2MR_MS', () => {
            const signer2 = EcKeyPair.generateRandomKeyPair(network);
            const signer3 = EcKeyPair.generateRandomKeyPair(network);

            const pubkeys = [signer.publicKey, signer2.publicKey, signer3.publicKey];

            const addr = P2MR_MS.generateMultiSigAddress(pubkeys, 2, network);
            expect(addr).toBeTruthy();
            expect(typeof addr).toBe('string');
            // P2MR uses segwit v2, regtest prefix is bcrt1z
            expect(addr).toMatch(/^bcrt1z/);
        });

        it('should generate different addresses for P2MR_MS vs P2TR_MS with same keys', () => {
            const signer2 = EcKeyPair.generateRandomKeyPair(network);
            const signer3 = EcKeyPair.generateRandomKeyPair(network);

            const pubkeys = [signer.publicKey, signer2.publicKey, signer3.publicKey];

            const p2mrAddr = P2MR_MS.generateMultiSigAddress(pubkeys, 2, network);
            const p2trAddr = P2TR_MS.generateMultiSigAddress(pubkeys, 2, network);

            expect(p2mrAddr).toBeTruthy();
            expect(p2trAddr).toBeTruthy();
            expect(p2mrAddr).not.toBe(p2trAddr);
            expect(p2mrAddr).toMatch(/^bcrt1z/);
            expect(p2trAddr).toMatch(/^bcrt1p/);
        });

        it('should throw on invalid public keys', () => {
            expect(() =>
                P2MR_MS.generateMultiSigAddress([new Uint8Array(33)], 1, network),
            ).toThrow();
        });
    });

    describe('P2MR DeploymentTransaction', () => {
        it('should produce a bc1z (P2MR) script address when useP2MR is true', () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);
            const challenge = createMockChallenge(walletAddress);
            const bytecode = new Uint8Array(100).fill(0xab);

            const tx = new DeploymentTransaction({
                signer,
                network,
                utxos: [utxo],
                bytecode,
                challenge,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: quantumRoot,
                useP2MR: true,
            });

            const scriptAddr = tx.getScriptAddress();
            expect(scriptAddr).toMatch(/^bcrt1z/);
        });

        it('should produce a bc1p (P2TR) script address by default', () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);
            const challenge = createMockChallenge(walletAddress);
            const bytecode = new Uint8Array(100).fill(0xab);

            const tx = new DeploymentTransaction({
                signer,
                network,
                utxos: [utxo],
                bytecode,
                challenge,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: quantumRoot,
            });

            const scriptAddr = tx.getScriptAddress();
            expect(scriptAddr).toMatch(/^bcrt1p/);
        });

        it('should build and sign a P2MR deployment transaction', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);
            const challenge = createMockChallenge(walletAddress);
            const bytecode = new Uint8Array(100).fill(0xab);

            const tx = new DeploymentTransaction({
                signer,
                network,
                utxos: [utxo],
                bytecode,
                challenge,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: quantumRoot,
                useP2MR: true,
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
            expect(signed.virtualSize()).toBeGreaterThan(0);
            expect(tx.contractAddress).toBeDefined();
            expect(tx.contractPubKey).toBeDefined();
        });

        it('should produce different script addresses for P2MR vs P2TR with same params', () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);
            const challenge = createMockChallenge(walletAddress);
            const bytecode = new Uint8Array(100).fill(0xab);
            const randomBytes = new Uint8Array(32).fill(0x42);

            const txP2MR = new DeploymentTransaction({
                signer,
                network,
                utxos: [utxo],
                bytecode,
                challenge,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: quantumRoot,
                useP2MR: true,
                randomBytes,
            });

            const txP2TR = new DeploymentTransaction({
                signer,
                network,
                utxos: [utxo],
                bytecode,
                challenge,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: quantumRoot,
                randomBytes,
            });

            expect(txP2MR.getScriptAddress()).not.toBe(txP2TR.getScriptAddress());
        });
    });

    describe('P2MR InteractionTransaction', () => {
        it('should produce a bc1z script address when useP2MR is true', () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);
            const challenge = createMockChallenge(walletAddress);
            const contract = '0x' + '00'.repeat(32);

            const tx = new InteractionTransaction({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                calldata: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
                challenge,
                contract,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: null,
                useP2MR: true,
            });

            const scriptAddr = tx.getScriptAddress();
            expect(scriptAddr).toMatch(/^bcrt1z/);
        });

        it('should build and sign a P2MR interaction transaction', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);
            const challenge = createMockChallenge(walletAddress);
            const contract = '0x' + '00'.repeat(32);

            const tx = new InteractionTransaction({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                calldata: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
                challenge,
                contract,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: null,
                useP2MR: true,
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
        });
    });

    describe('P2MR MultiSignTransaction', () => {
        it('should produce a bc1z script address when useP2MR is true', () => {
            const signer2 = EcKeyPair.generateRandomKeyPair(network);
            const signer3 = EcKeyPair.generateRandomKeyPair(network);
            const receiver = EcKeyPair.getTaprootAddress(signer2, network);
            const refundVault = EcKeyPair.getTaprootAddress(signer3, network);
            const pubkeys = [signer.publicKey, signer2.publicKey, signer3.publicKey];

            const tx = new MultiSignTransaction({
                network,
                utxos: [createTaprootUtxo(taprootAddress, 100_000n)],
                pubkeys,
                minimumSignatures: 2,
                receiver,
                requestedAmount: 30_000n,
                refundVault,
                feeRate: 1,
                mldsaSigner: null,
                useP2MR: true,
            });

            const scriptAddr = tx.getScriptAddress();
            expect(scriptAddr).toMatch(/^bcrt1z/);
        });

        it('should default to P2TR (bc1p) when useP2MR is not set', () => {
            const signer2 = EcKeyPair.generateRandomKeyPair(network);
            const signer3 = EcKeyPair.generateRandomKeyPair(network);
            const receiver = EcKeyPair.getTaprootAddress(signer2, network);
            const refundVault = EcKeyPair.getTaprootAddress(signer3, network);
            const pubkeys = [signer.publicKey, signer2.publicKey, signer3.publicKey];

            const tx = new MultiSignTransaction({
                network,
                utxos: [createTaprootUtxo(taprootAddress, 100_000n)],
                pubkeys,
                minimumSignatures: 2,
                receiver,
                requestedAmount: 30_000n,
                refundVault,
                feeRate: 1,
                mldsaSigner: null,
            });

            const scriptAddr = tx.getScriptAddress();
            expect(scriptAddr).toMatch(/^bcrt1p/);
        });

        it('should build a P2MR multisig PSBT', async () => {
            const signer2 = EcKeyPair.generateRandomKeyPair(network);
            const signer3 = EcKeyPair.generateRandomKeyPair(network);
            const receiver = EcKeyPair.getTaprootAddress(signer2, network);
            const refundVault = EcKeyPair.getTaprootAddress(signer3, network);
            const pubkeys = [signer.publicKey, signer2.publicKey, signer3.publicKey];

            const tx = new MultiSignTransaction({
                network,
                utxos: [createTaprootUtxo(taprootAddress, 100_000n)],
                pubkeys,
                minimumSignatures: 2,
                receiver,
                requestedAmount: 30_000n,
                refundVault,
                feeRate: 1,
                mldsaSigner: null,
                useP2MR: true,
            });

            const psbt = await tx.signPSBT();
            expect(psbt).toBeDefined();
            expect(psbt.data.inputs.length).toBeGreaterThan(0);
            expect(psbt.data.outputs.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('P2MR CancelTransaction', () => {
        it('should produce a bc1z script address when useP2MR is true', () => {
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
                useP2MR: true,
            });

            const scriptAddr = tx.getScriptAddress();
            expect(scriptAddr).toMatch(/^bcrt1z/);
        });

        it('should build and sign a P2MR cancel transaction', async () => {
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
                useP2MR: true,
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
        });
    });

    describe('P2MR CustomScriptTransaction', () => {
        it('should produce a bc1z script address when useP2MR is true', () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);
            const { crypto: bitCrypto } = require('@btc-vision/bitcoin');
            const fixedRandomBytes = new Uint8Array(32).fill(0x42);
            const contractSeed = bitCrypto.hash256(fixedRandomBytes);
            const contractSigner = EcKeyPair.fromSeedKeyPair(contractSeed, network);
            const contractXOnly = toXOnly(contractSigner.publicKey);
            const signerXOnly = toXOnly(signer.publicKey);

            const tx = new CustomScriptTransaction({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                script: [
                    contractXOnly,
                    new Uint8Array([opcodes.OP_CHECKSIGVERIFY]),
                    signerXOnly,
                    new Uint8Array([opcodes.OP_CHECKSIG]),
                ],
                witnesses: [],
                randomBytes: fixedRandomBytes,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: null,
                useP2MR: true,
            });

            const scriptAddr = tx.getScriptAddress();
            expect(scriptAddr).toMatch(/^bcrt1z/);
        });

        it('should build and sign a P2MR custom script transaction', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);
            const { crypto: bitCrypto } = await import('@btc-vision/bitcoin');
            const fixedRandomBytes = new Uint8Array(32).fill(0x42);
            const contractSeed = bitCrypto.hash256(fixedRandomBytes);
            const contractSigner = EcKeyPair.fromSeedKeyPair(contractSeed, network);
            const contractXOnly = toXOnly(contractSigner.publicKey);
            const signerXOnly = toXOnly(signer.publicKey);

            const tx = new CustomScriptTransaction({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                script: [
                    contractXOnly,
                    new Uint8Array([opcodes.OP_CHECKSIGVERIFY]),
                    signerXOnly,
                    new Uint8Array([opcodes.OP_CHECKSIG]),
                ],
                witnesses: [],
                randomBytes: fixedRandomBytes,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: null,
                useP2MR: true,
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
        });
    });

    describe('P2MR TimeLockGenerator', () => {
        it('should generate a P2MR address with CSV timelock', () => {
            const xOnlyPubKey = toXOnly(signer.publicKey);
            const addr = TimeLockGenerator.generateTimeLockAddressP2MR(xOnlyPubKey, network, 10);

            expect(addr).toBeTruthy();
            expect(addr).toMatch(/^bcrt1z/);
        });

        it('should generate different addresses for P2MR vs P2TR CSV', () => {
            const xOnlyPubKey = toXOnly(signer.publicKey);
            const p2mrAddr = TimeLockGenerator.generateTimeLockAddressP2MR(
                xOnlyPubKey,
                network,
                10,
            );
            const p2trAddr = TimeLockGenerator.generateTimeLockAddressP2TR(
                xOnlyPubKey,
                network,
                10,
            );

            expect(p2mrAddr).not.toBe(p2trAddr);
            expect(p2mrAddr).toMatch(/^bcrt1z/);
            expect(p2trAddr).toMatch(/^bcrt1p/);
        });

        it('should throw if public key is not 32 bytes', () => {
            expect(() =>
                TimeLockGenerator.generateTimeLockAddressP2MR(
                    new Uint8Array(33) as XOnlyPublicKey, // 33 bytes, not x-only — intentionally invalid
                    network,
                    10,
                ),
            ).toThrow('Public key must be 32 bytes');
        });

        it('should generate different addresses for different CSV block counts', () => {
            const xOnlyPubKey = toXOnly(signer.publicKey);
            const addr10 = TimeLockGenerator.generateTimeLockAddressP2MR(xOnlyPubKey, network, 10);
            const addr100 = TimeLockGenerator.generateTimeLockAddressP2MR(
                xOnlyPubKey,
                network,
                100,
            );

            expect(addr10).not.toBe(addr100);
        });
    });

    describe('Address.toCSVP2MR', () => {
        it('should generate a P2MR CSV address', () => {
            const addr = walletAddress.toCSVP2MR(10, network);

            expect(addr).toBeTruthy();
            expect(typeof addr).toBe('string');
            expect(addr).toMatch(/^bcrt1z/);
        });

        it('should differ from toCSVTweaked (P2TR)', () => {
            const p2mrAddr = walletAddress.toCSVP2MR(10, network);
            const p2trAddr = walletAddress.toCSVTweaked(10, network);

            expect(p2mrAddr).not.toBe(p2trAddr);
        });

        it('should throw for CSV blocks < 1', () => {
            expect(() => walletAddress.toCSVP2MR(0, network)).toThrow(
                'CSV block number must be between 1 and 65535',
            );
        });

        it('should throw for CSV blocks > 65535', () => {
            expect(() => walletAddress.toCSVP2MR(70000, network)).toThrow(
                'CSV block number must be between 1 and 65535',
            );
        });
    });

    describe('P2MR backward compatibility', () => {
        it('useP2MR defaults to false - all builders produce P2TR by default', () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);
            const challenge = createMockChallenge(walletAddress);
            const bytecode = new Uint8Array(100).fill(0xab);

            // DeploymentTransaction default
            const deployTx = new DeploymentTransaction({
                signer,
                network,
                utxos: [utxo],
                bytecode,
                challenge,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: quantumRoot,
            });
            expect(deployTx.getScriptAddress()).toMatch(/^bcrt1p/);

            // CancelTransaction default
            const cancelTx = new CancelTransaction({
                signer,
                network,
                utxos: [utxo],
                compiledTargetScript: script.compile([
                    toXOnly(signer.publicKey),
                    opcodes.OP_CHECKSIG,
                ]),
                feeRate: 1,
                mldsaSigner: null,
            });
            expect(cancelTx.getScriptAddress()).toMatch(/^bcrt1p/);
        });

        it('existing P2TR transactions still build and sign correctly', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);
            const challenge = createMockChallenge(walletAddress);
            const bytecode = new Uint8Array(100).fill(0xab);

            const tx = new DeploymentTransaction({
                signer,
                network,
                utxos: [utxo],
                bytecode,
                challenge,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: quantumRoot,
                // no useP2MR - defaults to P2TR
            });

            const signed = await tx.signTransaction();
            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
        });

        it('useP2MR: false explicitly still produces P2TR', () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);
            const challenge = createMockChallenge(walletAddress);
            const bytecode = new Uint8Array(100).fill(0xab);

            const tx = new DeploymentTransaction({
                signer,
                network,
                utxos: [utxo],
                bytecode,
                challenge,
                feeRate: 1,
                priorityFee: 330n,
                gasSatFee: 330n,
                mldsaSigner: quantumRoot,
                useP2MR: false,
            });

            expect(tx.getScriptAddress()).toMatch(/^bcrt1p/);
        });
    });

    describe('P2MR payment object construction', () => {
        it('payments.p2mr() produces valid output from script tree', () => {
            const witnessScript = script.compile([
                toXOnly(signer.publicKey),
                opcodes.OP_CHECKSIG,
            ]);

            const scriptTree = { output: witnessScript, version: 192 };
            const p2mr = payments.p2mr({ scriptTree, network });

            expect(p2mr.address).toBeTruthy();
            expect(p2mr.address).toMatch(/^bcrt1z/);
            expect(p2mr.output).toBeDefined();
            expect(p2mr.name).toBe(PaymentType.P2MR);

            // P2MR output: OP_2 <32-byte merkle_root> = 34 bytes
            expect(p2mr.output!.length).toBe(34);
            expect(p2mr.output![0]).toBe(opcodes.OP_2);
            // 0x20 = 32 (push 32 bytes)
            expect(p2mr.output![1]).toBe(0x20);
        });

        it('P2MR has no internalPubkey in payment', () => {
            const witnessScript = script.compile([
                toXOnly(signer.publicKey),
                opcodes.OP_CHECKSIG,
            ]);

            const scriptTree = { output: witnessScript, version: 192 };
            const p2mr = payments.p2mr({ scriptTree, network }) as P2MRPayment;

            // P2MR should NOT have internalPubkey
            expect((p2mr as any).internalPubkey).toBeUndefined();
            // P2MR should have hash (merkle root)
            expect(p2mr.hash).toBeDefined();
            expect(p2mr.hash!.length).toBe(32);
        });

        it('P2MR witness is smaller than P2TR witness (no internal pubkey in control block)', () => {
            const witnessScript = script.compile([
                toXOnly(signer.publicKey),
                opcodes.OP_CHECKSIG,
            ]);

            const scriptTree: Taptree = [
                { output: witnessScript, version: 192 },
                {
                    output: script.compile([opcodes.OP_XOR, opcodes.OP_NOP, opcodes.OP_CODESEPARATOR]),
                    version: 192,
                },
            ];

            const p2mr = payments.p2mr({
                scriptTree,
                network,
                redeem: { output: witnessScript, redeemVersion: 192 },
            });

            const p2tr = payments.p2tr({
                internalPubkey: toXOnly(signer.publicKey),
                scriptTree,
                network,
                redeem: { output: witnessScript, redeemVersion: 192 },
            });

            // Both should have witness arrays
            expect(p2mr.witness).toBeDefined();
            expect(p2tr.witness).toBeDefined();
            expect(p2mr.witness!.length).toBeGreaterThan(0);
            expect(p2tr.witness!.length).toBeGreaterThan(0);

            // P2MR control block should be 32 bytes smaller (no internal pubkey)
            const p2mrControlBlock = p2mr.witness![p2mr.witness!.length - 1] as Uint8Array;
            const p2trControlBlock = p2tr.witness![p2tr.witness!.length - 1] as Uint8Array;
            expect(p2trControlBlock.length - p2mrControlBlock.length).toBe(32);
        });
    });
});
