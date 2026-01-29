import { describe, expect, it, beforeAll } from 'vitest';
import { networks, payments, script, toHex, toXOnly, opcodes } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type { QuantumBIP32Interface } from '@btc-vision/bip32';
import {
    Address,
    CancelTransaction,
    CustomScriptTransaction,
    DeploymentTransaction,
    EcKeyPair,
    FundingTransaction,
    InteractionTransaction,
    MLDSASecurityLevel,
    Mnemonic,
    MultiSignTransaction,
} from '../build/opnet.js';
import type { IChallengeSolution, IChallengeVerification, UTXO } from '../build/opnet.js';

const network = networks.regtest;
const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/**
 * Helper: create a taproot UTXO for an address
 */
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
 * Helper: create a minimal mock IChallengeSolution
 */
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

describe('Transaction Builders - End-to-End', () => {
    let signer: UniversalSigner;
    let taprootAddress: string;
    let walletAddress: Address;
    let quantumRoot: QuantumBIP32Interface;

    beforeAll(() => {
        const mnemonic = new Mnemonic(
            testMnemonic,
            '',
            network,
            MLDSASecurityLevel.LEVEL2,
        );
        const wallet = mnemonic.derive(0);
        signer = wallet.keypair;
        walletAddress = wallet.address;
        taprootAddress = wallet.p2tr;
        quantumRoot = mnemonic.getQuantumRoot();
    });

    describe('FundingTransaction', () => {
        it('should build and sign a basic funding transaction', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);

            const tx = new FundingTransaction({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                amount: 50_000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
            expect(signed.virtualSize()).toBeGreaterThan(0);
        });

        it('should produce multiple outputs when splitInputsInto > 1', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);

            const tx = new FundingTransaction({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                amount: 100_000n,
                splitInputsInto: 3,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            const signed = await tx.signTransaction();

            // 3 split outputs + possible change output
            expect(signed.outs.length).toBeGreaterThanOrEqual(3);
            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
        });
    });

    describe('CancelTransaction', () => {
        it('should build and sign a cancel transaction with compiledTargetScript', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);

            // Use script.compile to produce a valid compiled target script
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
            expect(signed.toHex()).toBeTruthy();
            expect(signed.virtualSize()).toBeGreaterThan(0);
        });
    });

    describe('CustomScriptTransaction', () => {
        it('should build and sign a custom script transaction', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);

            // Use fixed random bytes so we can compute the contract signer's pubkey
            // and build a script that both signers can sign against.
            const { crypto: bitCrypto } = await import('@btc-vision/bitcoin');
            const fixedRandomBytes = new Uint8Array(32);
            fixedRandomBytes.fill(0x42);
            const contractSeed = bitCrypto.hash256(fixedRandomBytes);
            const contractSigner = EcKeyPair.fromSeedKeyPair(contractSeed, network);

            // Build a script that includes both pubkeys: [contractPubKey OP_CHECKSIGVERIFY signerXOnly OP_CHECKSIG]
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
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
            expect(signed.virtualSize()).toBeGreaterThan(0);
        });
    });

    describe('MultiSignTransaction', () => {
        it('should build a multisig transaction and produce valid PSBT', async () => {
            const signer2 = EcKeyPair.generateRandomKeyPair(network);
            const signer3 = EcKeyPair.generateRandomKeyPair(network);

            const receiver = EcKeyPair.getTaprootAddress(signer2, network);
            const refundVault = EcKeyPair.getTaprootAddress(signer3, network);

            const pubkeys = [signer.publicKey, signer2.publicKey, signer3.publicKey];

            const multiSigTx = new MultiSignTransaction({
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

            // signPSBT returns a Psbt (not fully signed since it's multisig)
            const psbt = await multiSigTx.signPSBT();

            expect(psbt).toBeDefined();
            expect(psbt.data.inputs.length).toBeGreaterThan(0);
            // There should be outputs (refund + receiver)
            expect(psbt.data.outputs.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('InteractionTransaction', () => {
        it('should build and sign an interaction transaction', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 100_000n);

            const challenge = createMockChallenge(walletAddress);

            // contract is a 32-byte hex string
            const contract = '0x' + '00'.repeat(32);

            // Let the builder generate the compiled target script from calldata+challenge
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
            });

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
            expect(signed.virtualSize()).toBeGreaterThan(0);
        });
    });

    describe('DeploymentTransaction', () => {
        it('should build and sign a deployment transaction', async () => {
            const utxo = createTaprootUtxo(taprootAddress, 200_000n);

            const challenge = createMockChallenge(walletAddress);

            // Minimal bytecode
            const bytecode = new Uint8Array(100);
            bytecode.fill(0xab);

            // Let the builder generate the compiled target script from bytecode+challenge
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

            const signed = await tx.signTransaction();

            expect(signed.ins.length).toBeGreaterThan(0);
            expect(signed.outs.length).toBeGreaterThan(0);
            expect(signed.toHex()).toBeTruthy();
            expect(signed.virtualSize()).toBeGreaterThan(0);

            // Deployment should expose contract address
            expect(tx.contractAddress).toBeDefined();
            expect(tx.contractPubKey).toBeDefined();
        });
    });
});
