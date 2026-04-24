import { beforeAll, describe, expect, it } from 'vitest';
import { networks, payments, toHex } from '@btc-vision/bitcoin';
import type { UniversalSigner } from '@btc-vision/ecpair';
import type {
    BitcoinTransferBase,
    IFundingTransactionParametersWithoutSigner,
    UTXO,
} from '../build/opnet.js';
import {
    FundingTransaction,
    MessageSigner,
    MLDSASecurityLevel,
    Mnemonic,
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

describe('IFundingTransactionParametersWithoutSigner', () => {
    it('should allow constructing params without signer, network, mldsaSigner, gasSatFee', () => {
        const params: IFundingTransactionParametersWithoutSigner = {
            amount: 50_000n,
            to: 'bcrt1pexample',
            from: 'bcrt1pexample',
            feeRate: 2,
            priorityFee: 0n,
            utxos: [],
        };

        expect(params.amount).toBe(50_000n);
        expect(params.feeRate).toBe(2);
        expect(params.priorityFee).toBe(0n);
        // signer, network, mldsaSigner, gasSatFee should NOT be present
        expect('signer' in params).toBe(false);
        expect('network' in params).toBe(false);
        expect('mldsaSigner' in params).toBe(false);
        expect('gasSatFee' in params).toBe(false);
    });

    it('should accept optional fields: splitInputsInto, autoAdjustAmount, feeUtxos, note', () => {
        const params: IFundingTransactionParametersWithoutSigner = {
            amount: 100_000n,
            to: 'bcrt1pexample',
            feeRate: 5,
            priorityFee: 0n,
            utxos: [],
            splitInputsInto: 3,
            autoAdjustAmount: true,
            feeUtxos: [],
            note: 'test memo',
        };

        expect(params.splitInputsInto).toBe(3);
        expect(params.autoAdjustAmount).toBe(true);
        expect(params.feeUtxos).toEqual([]);
        expect(params.note).toBe('test memo');
    });
});

describe('BitcoinTransferBase', () => {
    it('should be the return type of createBTCTransfer (no original field)', async () => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        const utxo = createTaprootUtxo(wallet.p2tr, 100_000n);

        const factory = new TransactionFactory();
        const result: BitcoinTransferBase = await factory.createBTCTransfer({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network,
            utxos: [utxo],
            to: wallet.p2tr,
            from: wallet.p2tr,
            amount: 50_000n,
            feeRate: 1,
            priorityFee: 0n,
            gasSatFee: 0n,
        });

        expect(result.tx).toBeTruthy();
        expect(typeof result.tx).toBe('string');
        expect(typeof result.estimatedFees).toBe('bigint');
        expect(Array.isArray(result.nextUTXOs)).toBe(true);
        expect(Array.isArray(result.inputUtxos)).toBe(true);
    });

    it('should return inputUtxos matching the provided utxos', async () => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        const utxo = createTaprootUtxo(wallet.p2tr, 200_000n, 'a'.repeat(64), 0);

        const factory = new TransactionFactory();
        const result = await factory.createBTCTransfer({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network,
            utxos: [utxo],
            to: wallet.p2tr,
            from: wallet.p2tr,
            amount: 50_000n,
            feeRate: 1,
            priorityFee: 0n,
            gasSatFee: 0n,
        });

        expect(result.inputUtxos.length).toBe(1);
        expect(result.inputUtxos[0]!.transactionId).toBe('a'.repeat(64));
    });

    it('should produce nextUTXOs for change', async () => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        const utxo = createTaprootUtxo(wallet.p2tr, 500_000n);

        const factory = new TransactionFactory();
        const result = await factory.createBTCTransfer({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network,
            utxos: [utxo],
            to: wallet.p2tr,
            from: wallet.p2tr,
            amount: 10_000n,
            feeRate: 1,
            priorityFee: 0n,
            gasSatFee: 0n,
        });

        expect(result.nextUTXOs.length).toBeGreaterThan(0);
    });
});

describe('TransactionFactory.createBTCTransfer', () => {
    let signer: UniversalSigner;
    let taprootAddress: string;

    beforeAll(() => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        signer = wallet.keypair;
        taprootAddress = wallet.p2tr;
    });

    it('should throw when "to" is missing', async () => {
        const utxo = createTaprootUtxo(taprootAddress, 100_000n);
        const factory = new TransactionFactory();

        await expect(
            factory.createBTCTransfer({
                signer,
                network,
                utxos: [utxo],
                from: taprootAddress,
                amount: 50_000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            }),
        ).rejects.toThrow(/to/i);
    });

    it('should throw when "from" is missing', async () => {
        const utxo = createTaprootUtxo(taprootAddress, 100_000n);
        const factory = new TransactionFactory();

        await expect(
            factory.createBTCTransfer({
                signer,
                network,
                utxos: [utxo],
                to: taprootAddress,
                amount: 50_000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            }),
        ).rejects.toThrow(/from/i);
    });

    it('should throw when utxos are empty', async () => {
        const factory = new TransactionFactory();

        await expect(
            factory.createBTCTransfer({
                signer,
                network,
                utxos: [],
                to: taprootAddress,
                from: taprootAddress,
                amount: 50_000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            }),
        ).rejects.toThrow(/UTXO/i);
    });

    it('should handle autoAdjustAmount for send-max', async () => {
        const utxo = createTaprootUtxo(taprootAddress, 100_000n);
        const factory = new TransactionFactory();

        const result = await factory.createBTCTransfer({
            signer,
            network,
            utxos: [utxo],
            to: taprootAddress,
            from: taprootAddress,
            amount: 100_000n,
            autoAdjustAmount: true,
            feeRate: 1,
            priorityFee: 0n,
            gasSatFee: 0n,
            mldsaSigner: null,
        });

        // Should succeed (fees deducted from amount) instead of throwing insufficient funds
        expect(result.tx).toBeTruthy();
        expect(typeof result.estimatedFees).toBe('bigint');
    });

    it('should handle optionalOutputs (extra outputs)', async () => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        const wallet2 = mnemonic.derive(1);
        const utxo = createTaprootUtxo(wallet.p2tr, 300_000n);

        const factory = new TransactionFactory();
        const result = await factory.createBTCTransfer({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network,
            utxos: [utxo],
            to: wallet.p2tr,
            from: wallet.p2tr,
            amount: 50_000n,
            feeRate: 1,
            priorityFee: 0n,
            gasSatFee: 0n,
            optionalOutputs: [
                { address: wallet2.p2tr, value: 10_000n },
            ],
        });

        expect(result.tx).toBeTruthy();
        expect(typeof result.estimatedFees).toBe('bigint');
    });
});

describe('MessageSigner.sha256 for signData hash verification', () => {
    it('should produce consistent SHA-256 hashes', () => {
        const message = 'Hello, OPNet!';
        const buffer = new TextEncoder().encode(message);
        const hash1 = MessageSigner.sha256(buffer);
        const hash2 = MessageSigner.sha256(buffer);

        expect(hash1).toEqual(hash2);
        expect(hash1.length).toBe(32);
    });

    it('should produce the correct hex hash for signData verification flow', () => {
        const originalMessage = '{"action":"verify","nonce":42}';
        const messageBuffer = new TextEncoder().encode(originalMessage);
        const hashedMessage = MessageSigner.sha256(messageBuffer);
        const messageHex = toHex(hashedMessage);

        // Verify it's a valid 64-char hex string (32 bytes)
        expect(messageHex).toMatch(/^[0-9a-f]{64}$/);

        // Verify the same input produces the same output (deterministic)
        const messageBuffer2 = new TextEncoder().encode(originalMessage);
        const hashedMessage2 = MessageSigner.sha256(messageBuffer2);
        const messageHex2 = toHex(hashedMessage2);
        expect(messageHex).toBe(messageHex2);
    });

    it('should produce different hashes for different messages', () => {
        const hash1 = toHex(MessageSigner.sha256(new TextEncoder().encode('message A')));
        const hash2 = toHex(MessageSigner.sha256(new TextEncoder().encode('message B')));

        expect(hash1).not.toBe(hash2);
    });
});

describe('Unisat interface - signData with originalMessage', () => {
    it('should accept signData type with optional originalMessage parameter', () => {
        const mockUnisat = {
            signData: async (
                _hex: string,
                _type?: string,
                _originalMessage?: string,
            ): Promise<string> => {
                return 'signature_hex';
            },
        };

        expect(typeof mockUnisat.signData).toBe('function');
        expect(mockUnisat.signData.length).toBeLessThanOrEqual(3);
    });
});

describe('FundingTransaction with feeUtxos', () => {
    it('should accept feeUtxos parameter', async () => {
        const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.derive(0);
        const mainUtxo = createTaprootUtxo(wallet.p2tr, 50_000n, 'a'.repeat(64), 0);
        const feeUtxo = createTaprootUtxo(wallet.p2tr, 50_000n, 'b'.repeat(64), 0);

        const tx = new FundingTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network,
            utxos: [mainUtxo],
            feeUtxos: [feeUtxo],
            to: wallet.p2tr,
            amount: 50_000n,
            feeRate: 1,
            priorityFee: 0n,
            gasSatFee: 0n,
        });

        const signed = await tx.signTransaction();
        // Should use both UTXOs (main + fee)
        expect(signed.ins.length).toBe(2);
        expect(signed.toHex()).toBeTruthy();
    });
});
