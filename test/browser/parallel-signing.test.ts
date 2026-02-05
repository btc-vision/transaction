import { describe, expect, it, beforeAll } from 'vitest';
import { networks, payments, toHex } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import {
    TransactionSerializer,
    OfflineTransactionManager,
    SERIALIZATION_FORMAT_VERSION,
    TransactionType,
    EcKeyPair,
    ChainId,
    currentConsensus,
} from '../../build/opnet.js';
import type {
    ISerializableTransactionState,
    FundingSpecificData,
    UTXO,
} from '../../build/opnet.js';

describe('Browser Parallel Signing', () => {
    const network = networks.regtest;

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

    const createTaprootUtxo = (
        address: string,
        value: bigint,
        txId: string = '0'.repeat(64),
        index: number = 0,
    ): UTXO => {
        const p2tr = payments.p2tr({ address, network });
        return {
            transactionId: txId,
            outputIndex: index,
            value,
            scriptPubKey: {
                hex: toHex(p2tr.output as Uint8Array),
                address,
            },
        };
    };

    const createFundingParams = (
        signer: UniversalSigner,
        from: string,
        to: string,
        txId: string,
    ) => ({
        signer,
        mldsaSigner: null,
        network,
        utxos: [createTaprootUtxo(from, 100000n, txId, 0)],
        from,
        to,
        feeRate: 10,
        priorityFee: 1000n,
        gasSatFee: 500n,
        amount: 50000n,
    });

    describe('Concurrent Signing (2 transactions)', () => {
        it('should sign two transactions concurrently', async () => {
            const params1 = createFundingParams(defaultSigner, defaultAddress, address2, 'a'.repeat(64));
            const params2 = createFundingParams(signer1, address1, address3, 'b'.repeat(64));

            const state1 = OfflineTransactionManager.exportFunding(params1);
            const state2 = OfflineTransactionManager.exportFunding(params2);

            const [tx1, tx2] = await Promise.all([
                OfflineTransactionManager.importSignAndExport(state1, { signer: defaultSigner }),
                OfflineTransactionManager.importSignAndExport(state2, { signer: signer1 }),
            ]);

            expect(tx1).toBeDefined();
            expect(tx2).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(tx1)).toBe(true);
            expect(/^[0-9a-f]+$/i.test(tx2)).toBe(true);
            expect(tx1).not.toBe(tx2);
        });
    });

    describe('Concurrent Signing (3 transactions)', () => {
        it('should sign three transactions concurrently', async () => {
            const params1 = createFundingParams(defaultSigner, defaultAddress, address1, 'c'.repeat(64));
            const params2 = createFundingParams(signer1, address1, address2, 'd'.repeat(64));
            const params3 = createFundingParams(signer2, address2, address3, 'e'.repeat(64));

            const state1 = OfflineTransactionManager.exportFunding(params1);
            const state2 = OfflineTransactionManager.exportFunding(params2);
            const state3 = OfflineTransactionManager.exportFunding(params3);

            const [tx1, tx2, tx3] = await Promise.all([
                OfflineTransactionManager.importSignAndExport(state1, { signer: defaultSigner }),
                OfflineTransactionManager.importSignAndExport(state2, { signer: signer1 }),
                OfflineTransactionManager.importSignAndExport(state3, { signer: signer2 }),
            ]);

            expect(tx1).toBeDefined();
            expect(tx2).toBeDefined();
            expect(tx3).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(tx1)).toBe(true);
            expect(/^[0-9a-f]+$/i.test(tx2)).toBe(true);
            expect(/^[0-9a-f]+$/i.test(tx3)).toBe(true);
        });
    });

    describe('Concurrent Fee Bumping', () => {
        it('should bump and sign multiple transactions concurrently', async () => {
            const params1 = createFundingParams(defaultSigner, defaultAddress, address2, 'f'.repeat(64));
            const params2 = createFundingParams(signer1, address1, address3, '1'.repeat(64));

            const state1 = OfflineTransactionManager.exportFunding(params1);
            const state2 = OfflineTransactionManager.exportFunding(params2);

            const bumped1 = OfflineTransactionManager.rebuildWithNewFees(state1, 30);
            const bumped2 = OfflineTransactionManager.rebuildWithNewFees(state2, 50);

            const [tx1, tx2] = await Promise.all([
                OfflineTransactionManager.importSignAndExport(bumped1, { signer: defaultSigner }),
                OfflineTransactionManager.importSignAndExport(bumped2, { signer: signer1 }),
            ]);

            expect(tx1).toBeDefined();
            expect(tx2).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(tx1)).toBe(true);
            expect(/^[0-9a-f]+$/i.test(tx2)).toBe(true);
        });
    });

    describe('Concurrent Serialization', () => {
        it('should serialize and deserialize multiple states concurrently', async () => {
            const createState = (from: string, to: string): ISerializableTransactionState => ({
                header: {
                    formatVersion: SERIALIZATION_FORMAT_VERSION,
                    consensusVersion: currentConsensus,
                    transactionType: TransactionType.FUNDING,
                    chainId: ChainId.Bitcoin,
                    timestamp: Date.now(),
                },
                baseParams: {
                    from,
                    to,
                    feeRate: 10,
                    priorityFee: '1000',
                    gasSatFee: '500',
                    networkName: 'regtest',
                    txVersion: 2,
                    anchor: false,
                },
                utxos: [{
                    transactionId: '0'.repeat(64),
                    outputIndex: 0,
                    value: '100000',
                    scriptPubKeyHex: 'aa',
                    scriptPubKeyAddress: from,
                }],
                optionalInputs: [],
                optionalOutputs: [],
                addressRotationEnabled: false,
                signerMappings: [],
                typeSpecificData: {
                    type: TransactionType.FUNDING,
                    amount: '50000',
                    splitInputsInto: 1,
                } as FundingSpecificData,
                precomputedData: {},
            });

            const states = [
                createState(address1, address2),
                createState(address2, address3),
                createState(address3, address1),
                createState(defaultAddress, address1),
                createState(defaultAddress, address2),
            ];

            // Serialize all concurrently
            const serialized = await Promise.all(
                states.map(async (state) => TransactionSerializer.serialize(state)),
            );

            // Deserialize all concurrently
            const deserialized = await Promise.all(
                serialized.map(async (data) => TransactionSerializer.deserialize(data)),
            );

            // Verify all round-tripped correctly
            for (let i = 0; i < states.length; i++) {
                expect(deserialized[i]!.baseParams.from).toBe(states[i]!.baseParams.from);
                expect(deserialized[i]!.baseParams.to).toBe(states[i]!.baseParams.to);
            }
        });

        it('should handle 10 concurrent serialize/deserialize operations', async () => {
            const results = await Promise.all(
                Array.from({ length: 10 }, async (_, i) => {
                    const state: ISerializableTransactionState = {
                        header: {
                            formatVersion: SERIALIZATION_FORMAT_VERSION,
                            consensusVersion: currentConsensus,
                            transactionType: TransactionType.FUNDING,
                            chainId: ChainId.Bitcoin,
                            timestamp: Date.now() + i,
                        },
                        baseParams: {
                            from: address1,
                            to: address2,
                            feeRate: 10 + i,
                            priorityFee: String(1000 + i),
                            gasSatFee: '500',
                            networkName: 'regtest',
                            txVersion: 2,
                            anchor: false,
                        },
                        utxos: [{
                            transactionId: String(i).repeat(64).slice(0, 64),
                            outputIndex: i,
                            value: String(100000 + i),
                            scriptPubKeyHex: 'aa',
                            scriptPubKeyAddress: address1,
                        }],
                        optionalInputs: [],
                        optionalOutputs: [],
                        addressRotationEnabled: false,
                        signerMappings: [],
                        typeSpecificData: {
                            type: TransactionType.FUNDING,
                            amount: String(50000 + i),
                            splitInputsInto: 1,
                        } as FundingSpecificData,
                        precomputedData: {},
                    };

                    const serialized = TransactionSerializer.serialize(state);
                    const deserialized = TransactionSerializer.deserialize(serialized);
                    return { original: state, deserialized };
                }),
            );

            expect(results).toHaveLength(10);
            for (const { original, deserialized } of results) {
                expect(deserialized.baseParams.feeRate).toBeCloseTo(original.baseParams.feeRate, 3);
                expect(deserialized.baseParams.priorityFee).toBe(original.baseParams.priorityFee);
            }
        });
    });

    describe('Concurrent Two-Step Signing', () => {
        it('should import and sign multiple transactions via two-step process', async () => {
            const params1 = createFundingParams(signer1, address1, address2, '7'.repeat(64));
            const params2 = createFundingParams(signer2, address2, address3, '8'.repeat(64));

            const state1 = OfflineTransactionManager.exportFunding(params1);
            const state2 = OfflineTransactionManager.exportFunding(params2);

            const builder1 = OfflineTransactionManager.importForSigning(state1, { signer: signer1 });
            const builder2 = OfflineTransactionManager.importForSigning(state2, { signer: signer2 });

            const [tx1, tx2] = await Promise.all([
                OfflineTransactionManager.signAndExport(builder1),
                OfflineTransactionManager.signAndExport(builder2),
            ]);

            expect(tx1).toBeDefined();
            expect(tx2).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(tx1)).toBe(true);
            expect(/^[0-9a-f]+$/i.test(tx2)).toBe(true);
        });
    });

    describe('Concurrent Export/Import/Validate', () => {
        it('should export, validate, and inspect multiple states concurrently', async () => {
            const allParams = [
                createFundingParams(defaultSigner, defaultAddress, address1, '9'.repeat(64)),
                createFundingParams(signer1, address1, address2, 'a1'.repeat(32)),
                createFundingParams(signer2, address2, address3, 'b2'.repeat(32)),
                createFundingParams(signer3, address3, defaultAddress, 'c3'.repeat(32)),
            ];

            const exported = allParams.map((p) => OfflineTransactionManager.exportFunding(p));

            const [validations, inspections] = await Promise.all([
                Promise.all(exported.map(async (e) => OfflineTransactionManager.validate(e))),
                Promise.all(exported.map(async (e) => OfflineTransactionManager.inspect(e))),
            ]);

            for (const valid of validations) {
                expect(valid).toBe(true);
            }

            expect(inspections[0]!.baseParams.from).toBe(defaultAddress);
            expect(inspections[1]!.baseParams.from).toBe(address1);
            expect(inspections[2]!.baseParams.from).toBe(address2);
            expect(inspections[3]!.baseParams.from).toBe(address3);
        });
    });
});
