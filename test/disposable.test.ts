import { describe, expect, it } from 'vitest';
import {
    Address,
    AddressMap,
    AddressSet,
    BinaryWriter,
    CustomMap,
    DeterministicMap,
    DeterministicSet,
    ExtendedAddressMap,
    FastMap,
    FundingTransaction,
    MLDSASecurityLevel,
    Mnemonic,
    EcKeyPair,
} from '../build/opnet.js';
import type { UTXO } from '../build/opnet.js';
import { networks, payments, toHex } from '@btc-vision/bitcoin';

const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const network = networks.regtest;

describe('Disposable - Symbol.dispose implementations', () => {
    describe('Security-critical: Wallet', () => {
        it('should zero private key material on dispose', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                network,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            // Verify keys exist before dispose
            expect(wallet.keypair.privateKey).toBeDefined();
            expect(wallet.mldsaKeypair.privateKey).toBeDefined();

            const classicalPrivKey = wallet.keypair.privateKey as Uint8Array;
            const mldsaPrivKey = wallet.mldsaKeypair.privateKey as Uint8Array;

            // Verify non-zero before dispose
            expect(classicalPrivKey.some((b) => b !== 0)).toBe(true);
            expect(mldsaPrivKey.some((b) => b !== 0)).toBe(true);

            wallet[Symbol.dispose]();

            // Verify zeroed after dispose
            expect(classicalPrivKey.every((b) => b === 0)).toBe(true);
            expect(mldsaPrivKey.every((b) => b === 0)).toBe(true);
        });

        it('should zero chain code on dispose', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                network,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const chainCode = wallet.chainCode;
            wallet[Symbol.dispose]();

            expect(chainCode.every((b) => b === 0)).toBe(true);
        });
    });

    describe('Security-critical: Mnemonic', () => {
        it('should zero seed on dispose', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                network,
                MLDSASecurityLevel.LEVEL2,
            );

            // Access seed internally via the getter (returns a copy)
            // We need to check the internal buffer is zeroed
            const seedBefore = mnemonic.seed;
            expect(seedBefore.some((b) => b !== 0)).toBe(true);

            // Get reference to root keys before dispose
            const classicalRoot = mnemonic.getClassicalRoot();
            const quantumRoot = mnemonic.getQuantumRoot();
            const classicalPrivKey = classicalRoot.privateKey;
            const quantumPrivKey = quantumRoot.privateKey;

            expect(classicalPrivKey).toBeDefined();
            expect(quantumPrivKey).toBeDefined();

            mnemonic[Symbol.dispose]();

            // After dispose, the internal seed should be zeroed
            // The getter returns a copy, so check the root keys
            expect((classicalPrivKey as Uint8Array).every((b) => b === 0)).toBe(true);
            expect((quantumPrivKey as Uint8Array).every((b) => b === 0)).toBe(true);
        });
    });

    describe('Security-critical: Address', () => {
        it('should zero base Uint8Array on dispose', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                network,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const addr = wallet.address;

            // Verify non-zero before
            expect(addr.some((b) => b !== 0)).toBe(true);

            addr[Symbol.dispose]();

            // Verify zeroed after dispose
            expect(addr.every((b) => b === 0)).toBe(true);
        });
    });

    describe('Collections: AddressMap', () => {
        it('should clear all entries on dispose', () => {
            const map = new AddressMap<number>();
            const addr1 = new Address(Buffer.alloc(32, 0x01));
            const addr2 = new Address(Buffer.alloc(32, 0x02));

            map.set(addr1, 1);
            map.set(addr2, 2);
            expect(map.size).toBe(2);

            map[Symbol.dispose]();

            expect(map.size).toBe(0);
        });
    });

    describe('Collections: ExtendedAddressMap', () => {
        it('should clear all entries on dispose', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                network,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet1 = mnemonic.derive(0);
            const wallet2 = mnemonic.derive(1);

            const map = new ExtendedAddressMap<number>();
            map.set(wallet1.address, 10);
            map.set(wallet2.address, 20);
            expect(map.size).toBe(2);

            map[Symbol.dispose]();

            expect(map.size).toBe(0);
        });
    });

    describe('Collections: FastMap', () => {
        it('should clear all entries on dispose', () => {
            const map = new FastMap<string, number>();
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            expect(map.size).toBe(3);

            map[Symbol.dispose]();

            expect(map.size).toBe(0);
        });
    });

    describe('Collections: DeterministicMap', () => {
        it('should clear all entries on dispose', () => {
            const map = new DeterministicMap<number, string>((a, b) => a - b);
            map.set(3, 'three');
            map.set(1, 'one');
            map.set(2, 'two');
            expect(map.size).toBe(3);

            map[Symbol.dispose]();

            expect(map.size).toBe(0);
        });
    });

    describe('Collections: DeterministicSet', () => {
        it('should clear all elements on dispose', () => {
            const set = new DeterministicSet<number>((a, b) => a - b);
            set.add(1);
            set.add(2);
            set.add(3);
            expect(set.size).toBe(3);

            set[Symbol.dispose]();

            expect(set.size).toBe(0);
        });
    });

    describe('Collections: AddressSet', () => {
        it('should clear all entries on dispose', () => {
            const addr1 = new Address(Buffer.alloc(32, 0x01));
            const addr2 = new Address(Buffer.alloc(32, 0x02));

            const set = new AddressSet([addr1, addr2]);
            expect(set.size).toBe(2);

            set[Symbol.dispose]();

            expect(set.size).toBe(0);
        });
    });

    describe('Collections: CustomMap', () => {
        it('should clear all entries on dispose', () => {
            const map = new CustomMap<string, number>();
            map.set('foo', 1);
            map.set('bar', 2);
            expect(map.size).toBe(2);

            map[Symbol.dispose]();

            expect(map.size).toBe(0);
        });
    });

    describe('Buffers: BinaryWriter', () => {
        it('should reset buffer on dispose', () => {
            const writer = new BinaryWriter();
            writer.writeU32(0xdeadbeef);
            writer.writeU64(123456789n);

            expect(writer.getOffset()).toBeGreaterThan(0);

            writer[Symbol.dispose]();

            expect(writer.getOffset()).toBe(0);
        });
    });

    describe('Transaction state: TransactionBuilder (via FundingTransaction)', () => {
        it('should clear inputs, outputs, and utxos on dispose', () => {
            const signer = EcKeyPair.generateRandomKeyPair(network);
            const taprootAddress = EcKeyPair.getTaprootAddress(signer, network);
            const p2tr = payments.p2tr({ address: taprootAddress, network });

            const utxo: UTXO = {
                transactionId: '0'.repeat(64),
                outputIndex: 0,
                value: 100_000n,
                scriptPubKey: {
                    hex: toHex(p2tr.output as Uint8Array),
                    address: taprootAddress,
                },
            };

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

            tx[Symbol.dispose]();

            // After dispose, getInputs/getOutputs should be empty
            expect(tx.getInputs().length).toBe(0);
            expect(tx.getOutputs().length).toBe(0);
        });
    });
});
