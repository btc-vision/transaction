import { describe, expect, it, beforeAll } from 'vitest';
import {
    createAddressRotation,
    createSignerMap,
    disabledAddressRotation,
    EcKeyPair,
    FundingTransaction,
} from '../build/opnet.js';
import type { SignerMap, RotationSigner, AddressRotationConfig, UTXO } from '../build/opnet.js';
import { networks, payments, toXOnly, toHex, equals } from '@btc-vision/bitcoin';
import type { UniversalSigner } from '@btc-vision/ecpair';

describe('Address Rotation', () => {
    const network = networks.regtest;

    // Generate test keypairs
    let signer1: UniversalSigner;
    let signer2: UniversalSigner;
    let signer3: UniversalSigner;
    let defaultSigner: UniversalSigner;

    let address1: string;
    let address2: string;
    let address3: string;
    let defaultAddress: string;

    beforeAll(() => {
        signer1 = EcKeyPair.generateRandomKeyPair(network);
        signer2 = EcKeyPair.generateRandomKeyPair(network);
        signer3 = EcKeyPair.generateRandomKeyPair(network);
        defaultSigner = EcKeyPair.generateRandomKeyPair(network);

        address1 = EcKeyPair.getTaprootAddress(signer1, network);
        address2 = EcKeyPair.getTaprootAddress(signer2, network);
        address3 = EcKeyPair.getTaprootAddress(signer3, network);
        defaultAddress = EcKeyPair.getTaprootAddress(defaultSigner, network);
    });

    // Helper to create a taproot UTXO
    const createTaprootUtxo = (
        address: string,
        value: bigint,
        txId: string = '0'.repeat(64),
        index: number = 0,
    ): UTXO => {
        const p2tr = payments.p2tr({
            address,
            network,
        });

        return {
            transactionId: txId,
            outputIndex: index,
            value,
            scriptPubKey: {
                hex: toHex(p2tr.output!),
                address,
            },
        };
    };

    describe('createSignerMap', () => {
        it('should create a SignerMap from an array of pairs', () => {
            const pairs: ReadonlyArray<readonly [string, RotationSigner]> = [
                [address1, signer1],
                [address2, signer2],
            ];

            const map = createSignerMap(pairs);

            expect(map).toBeInstanceOf(Map);
            expect(map.size).toBe(2);
            expect(map.get(address1)).toBe(signer1);
            expect(map.get(address2)).toBe(signer2);
        });

        it('should create an empty map from empty array', () => {
            const map = createSignerMap([]);

            expect(map.size).toBe(0);
        });

        it('should handle duplicate addresses by using the last value', () => {
            const pairs: ReadonlyArray<readonly [string, RotationSigner]> = [
                [address1, signer1],
                [address1, signer2], // Same address, different signer
            ];

            const map = createSignerMap(pairs);

            expect(map.size).toBe(1);
            expect(map.get(address1)).toBe(signer2);
        });
    });

    describe('createAddressRotation', () => {
        it('should create an enabled AddressRotationConfig from SignerMap', () => {
            const signerMap: SignerMap = new Map([
                [address1, signer1],
                [address2, signer2],
            ]);

            const config = createAddressRotation(signerMap);

            expect(config.enabled).toBe(true);
            expect(config.signerMap).toBe(signerMap);
            expect(config.signerMap.size).toBe(2);
        });

        it('should create an enabled AddressRotationConfig from array of pairs', () => {
            const pairs: ReadonlyArray<readonly [string, RotationSigner]> = [
                [address1, signer1],
                [address2, signer2],
                [address3, signer3],
            ];

            const config = createAddressRotation(pairs);

            expect(config.enabled).toBe(true);
            expect(config.signerMap.size).toBe(3);
            expect(config.signerMap.get(address1)).toBe(signer1);
            expect(config.signerMap.get(address2)).toBe(signer2);
            expect(config.signerMap.get(address3)).toBe(signer3);
        });
    });

    describe('disabledAddressRotation', () => {
        it('should create a disabled AddressRotationConfig', () => {
            const config = disabledAddressRotation();

            expect(config.enabled).toBe(false);
            expect(config.signerMap).toBeInstanceOf(Map);
            expect(config.signerMap.size).toBe(0);
        });
    });

    describe('UTXO with signer', () => {
        it('should allow attaching a signer directly to UTXO', () => {
            const utxo = createTaprootUtxo(address1, 10000n);
            const utxoWithSigner: UTXO = {
                ...utxo,
                signer: signer1,
            };

            expect(utxoWithSigner.signer).toBe(signer1);
        });
    });

    describe('FundingTransaction with address rotation', () => {
        it('should create transaction with single signer (backward compatible)', async () => {
            const utxo = createTaprootUtxo(defaultAddress, 100000n);

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo],
                to: address1,
                amount: 50000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            expect(tx.isAddressRotationEnabled()).toBe(false);

            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
            expect(signedTx.ins.length).toBe(1);
        });

        it('should create transaction with address rotation using signerMap', async () => {
            const utxo1 = createTaprootUtxo(address1, 50000n, 'a'.repeat(64), 0);
            const utxo2 = createTaprootUtxo(address2, 50000n, 'b'.repeat(64), 0);

            const signerMap: SignerMap = new Map([
                [address1, signer1],
                [address2, signer2],
            ]);

            const tx = new FundingTransaction({
                signer: defaultSigner, // fallback
                network,
                utxos: [utxo1, utxo2],
                to: address3,
                amount: 80000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation(signerMap),
            });

            expect(tx.isAddressRotationEnabled()).toBe(true);

            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
            expect(signedTx.ins.length).toBe(2);
        });

        it('should create transaction with UTXOs having embedded signers', async () => {
            const utxo1: UTXO = {
                ...createTaprootUtxo(address1, 50000n, 'c'.repeat(64), 0),
                signer: signer1,
            };
            const utxo2: UTXO = {
                ...createTaprootUtxo(address2, 50000n, 'd'.repeat(64), 0),
                signer: signer2,
            };

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo1, utxo2],
                to: address3,
                amount: 80000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: {
                    enabled: true,
                    signerMap: new Map(),
                },
            });

            expect(tx.isAddressRotationEnabled()).toBe(true);

            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
            expect(signedTx.ins.length).toBe(2);
        });

        it('should prioritize UTXO embedded signer over signerMap', async () => {
            // UTXO has address1 but we attach signer2
            const utxo: UTXO = {
                ...createTaprootUtxo(address1, 100000n, 'e'.repeat(64), 0),
                signer: signer1, // Embedded signer
            };

            // SignerMap has a different signer for address1
            const signerMap: SignerMap = new Map([
                [address1, signer3], // This should be ignored
            ]);

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo],
                to: address2,
                amount: 50000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation(signerMap),
            });

            // Should successfully sign with embedded signer (signer1)
            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
        });

        it('should fall back to default signer when address not in signerMap', async () => {
            // Create UTXO from defaultAddress (not in signerMap)
            const utxo = createTaprootUtxo(defaultAddress, 100000n, 'f'.repeat(64), 0);

            const signerMap: SignerMap = new Map([
                [address1, signer1],
                [address2, signer2],
            ]);

            const tx = new FundingTransaction({
                signer: defaultSigner, // Will be used as fallback
                network,
                utxos: [utxo],
                to: address1,
                amount: 50000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation(signerMap),
            });

            // Should successfully sign with default signer
            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
        });

        it('should handle mixed UTXOs (some in map, some with embedded, some fallback)', async () => {
            const utxo1 = createTaprootUtxo(address1, 30000n, '1'.repeat(64), 0);
            const utxo2: UTXO = {
                ...createTaprootUtxo(address2, 30000n, '2'.repeat(64), 0),
                signer: signer2, // Embedded
            };
            const utxo3 = createTaprootUtxo(defaultAddress, 40000n, '3'.repeat(64), 0);

            const signerMap: SignerMap = new Map([
                [address1, signer1], // For utxo1
                // address2 not in map, but utxo2 has embedded signer
                // defaultAddress not in map, will use fallback
            ]);

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo1, utxo2, utxo3],
                to: address3,
                amount: 80000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation(signerMap),
            });

            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
            expect(signedTx.ins.length).toBe(3);
        });

        it('should work with optionalInputs in address rotation mode', async () => {
            const utxo = createTaprootUtxo(address1, 50000n, '4'.repeat(64), 0);
            const optionalUtxo = createTaprootUtxo(address2, 50000n, '5'.repeat(64), 0);

            const signerMap: SignerMap = new Map([
                [address1, signer1],
                [address2, signer2],
            ]);

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo],
                optionalInputs: [optionalUtxo],
                to: address3,
                amount: 80000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation(signerMap),
            });

            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
            expect(signedTx.ins.length).toBe(2);
        });
    });

    describe('AddressRotationConfig interface', () => {
        it('should accept a properly typed config object', () => {
            const config: AddressRotationConfig = {
                enabled: true,
                signerMap: new Map([[address1, signer1]]),
            };

            expect(config.enabled).toBe(true);
            expect(config.signerMap.get(address1)).toBe(signer1);
        });

        it('should work with readonly signerMap', () => {
            const signerMap: SignerMap = new Map([[address1, signer1]]);

            // Config signerMap is readonly
            const config: AddressRotationConfig = {
                enabled: true,
                signerMap,
            };

            // Verify the signerMap is accessible
            expect(config.signerMap.size).toBe(1);
        });
    });

    describe('Edge cases', () => {
        it('should handle transaction with single UTXO and address rotation enabled', async () => {
            const utxo = createTaprootUtxo(address1, 100000n, '6'.repeat(64), 0);

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo],
                to: address2,
                amount: 50000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation([[address1, signer1]]),
            });

            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
            expect(signedTx.ins.length).toBe(1);
        });

        it('should handle many UTXOs from different addresses', async () => {
            const signers: UniversalSigner[] = [];
            const addresses: string[] = [];
            const utxos: UTXO[] = [];

            // Create 5 different signers and UTXOs
            for (let i = 0; i < 5; i++) {
                const signer = EcKeyPair.generateRandomKeyPair(network);
                const addr = EcKeyPair.getTaprootAddress(signer, network);
                signers.push(signer);
                addresses.push(addr);
                utxos.push(createTaprootUtxo(addr, 20000n, i.toString().repeat(64), 0));
            }

            const pairs: [string, UniversalSigner][] = addresses.map((addr, i) => [
                addr,
                signers[i] as UniversalSigner,
            ]);

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos,
                to: defaultAddress,
                amount: 80000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation(pairs),
            });

            const signedTx = await tx.signTransaction();
            expect(signedTx).toBeDefined();
            expect(signedTx.ins.length).toBe(5);
        });

        it('should correctly report isAddressRotationEnabled state', () => {
            const utxo = createTaprootUtxo(address1, 100000n);

            // Without address rotation
            const tx1 = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo],
                to: address2,
                amount: 50000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });
            expect(tx1.isAddressRotationEnabled()).toBe(false);

            // With disabled address rotation
            const tx2 = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo],
                to: address2,
                amount: 50000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: disabledAddressRotation(),
            });
            expect(tx2.isAddressRotationEnabled()).toBe(false);

            // With enabled address rotation
            const tx3 = new FundingTransaction({
                signer: signer1, // Must use correct signer for this address
                network,
                utxos: [utxo],
                to: address2,
                amount: 50000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation([[address1, signer1]]),
            });
            expect(tx3.isAddressRotationEnabled()).toBe(true);
        });
    });

    describe('Taproot key verification', () => {
        it('should use correct tapInternalKey for each input in rotation mode', async () => {
            const utxo1 = createTaprootUtxo(address1, 50000n, 'a1'.padEnd(64, '0'), 0);
            const utxo2 = createTaprootUtxo(address2, 50000n, 'a2'.padEnd(64, '0'), 0);

            const signerMap: SignerMap = new Map([
                [address1, signer1],
                [address2, signer2],
            ]);

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo1, utxo2],
                to: address3,
                amount: 80000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
                addressRotation: createAddressRotation(signerMap),
            });

            // Generate minimal signatures to populate inputs
            await tx.generateTransactionMinimalSignatures();

            // Get inputs after building
            const inputs = tx.getInputs();

            // Verify each input has the correct tapInternalKey
            const expectedKey1 = toXOnly(signer1.publicKey);
            const expectedKey2 = toXOnly(signer2.publicKey);

            expect((inputs[0] as (typeof inputs)[0]).tapInternalKey).toBeDefined();
            expect((inputs[1] as (typeof inputs)[0]).tapInternalKey).toBeDefined();
            expect(equals((inputs[0] as (typeof inputs)[0]).tapInternalKey!, expectedKey1)).toBe(true);
            expect(equals((inputs[1] as (typeof inputs)[0]).tapInternalKey!, expectedKey2)).toBe(true);
        });

        it('should use default signer tapInternalKey when rotation disabled', async () => {
            // Create UTXO from defaultSigner's address
            const utxo = createTaprootUtxo(defaultAddress, 100000n, 'b1'.padEnd(64, '0'), 0);

            const tx = new FundingTransaction({
                signer: defaultSigner,
                network,
                utxos: [utxo],
                to: address1,
                amount: 50000n,
                feeRate: 1,
                priorityFee: 0n,
                gasSatFee: 0n,
                mldsaSigner: null,
            });

            // Generate minimal signatures to populate inputs
            await tx.generateTransactionMinimalSignatures();

            const inputs = tx.getInputs();
            const expectedKey = toXOnly(defaultSigner.publicKey);

            expect(inputs[0].tapInternalKey).toBeDefined();
            expect(equals(inputs[0].tapInternalKey!, expectedKey)).toBe(true);
        });
    });
});
