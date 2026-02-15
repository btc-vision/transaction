import { beforeAll, describe, expect, it } from 'vitest';
import { networks, payments, toHex } from '@btc-vision/bitcoin';
import { type UniversalSigner } from '@btc-vision/ecpair';
import type {
    FundingSpecificData,
    ISerializableTransactionState,
    ReconstructionOptions,
    UTXO,
} from '../../build/opnet.js';
import {
    ChainId,
    createAddressRotation,
    createSignerMap,
    currentConsensus,
    EcKeyPair,
    FundingTransaction,
    isFundingSpecificData,
    MessageSigner,
    OfflineTransactionManager,
    SERIALIZATION_FORMAT_VERSION,
    TransactionReconstructor,
    TransactionSerializer,
    TransactionStateCapture,
    TransactionType,
} from '../../build/opnet.js';

describe('Browser Transaction Signing', () => {
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

    describe('Single Transaction Signing', () => {
        it('should export and sign a funding transaction', async () => {
            const params = {
                signer: defaultSigner,
                mldsaSigner: null,
                network,
                utxos: [createTaprootUtxo(defaultAddress, 100000n, 'a'.repeat(64), 0)],
                from: defaultAddress,
                to: address2,
                feeRate: 10,
                priorityFee: 1000n,
                gasSatFee: 500n,
                amount: 50000n,
            };

            const exportedState = OfflineTransactionManager.exportFunding(params);
            expect(OfflineTransactionManager.validate(exportedState)).toBe(true);

            const signedTxHex = await OfflineTransactionManager.importSignAndExport(exportedState, {
                signer: defaultSigner,
            });

            expect(signedTxHex).toBeDefined();
            expect(typeof signedTxHex).toBe('string');
            expect(signedTxHex.length).toBeGreaterThan(0);
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });

        it('should sign using two-step import then sign', async () => {
            const params = {
                signer: signer1,
                mldsaSigner: null,
                network,
                utxos: [createTaprootUtxo(address1, 80000n, 'b'.repeat(64), 0)],
                from: address1,
                to: address2,
                feeRate: 15,
                priorityFee: 500n,
                gasSatFee: 300n,
                amount: 40000n,
            };

            const exportedState = OfflineTransactionManager.exportFunding(params);

            const builder = OfflineTransactionManager.importForSigning(exportedState, {
                signer: signer1,
            });

            expect(builder).toBeDefined();
            expect(builder.type).toBe(TransactionType.FUNDING);

            const signedTxHex = await OfflineTransactionManager.signAndExport(builder);
            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });
    });

    describe('Fee Bumping', () => {
        it('should sign with bumped fee rate', async () => {
            const params = {
                signer: signer2,
                mldsaSigner: null,
                network,
                utxos: [createTaprootUtxo(address2, 120000n, 'c'.repeat(64), 0)],
                from: address2,
                to: address3,
                feeRate: 5,
                priorityFee: 200n,
                gasSatFee: 100n,
                amount: 60000n,
            };

            const originalState = OfflineTransactionManager.exportFunding(params);
            const bumpedState = OfflineTransactionManager.rebuildWithNewFees(originalState, 25);

            const bumpedInspected = OfflineTransactionManager.inspect(bumpedState);
            expect(bumpedInspected.baseParams.feeRate).toBeCloseTo(25, 3);

            const signedTxHex = await OfflineTransactionManager.importSignAndExport(bumpedState, {
                signer: signer2,
            });

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });

        it('should sign with rebuildSignAndExport convenience method', async () => {
            const params = {
                signer: signer3,
                mldsaSigner: null,
                network,
                utxos: [createTaprootUtxo(address3, 90000n, 'd'.repeat(64), 0)],
                from: address3,
                to: address1,
                feeRate: 8,
                priorityFee: 300n,
                gasSatFee: 150n,
                amount: 45000n,
            };

            const originalState = OfflineTransactionManager.exportFunding(params);

            const signedTxHex = await OfflineTransactionManager.rebuildSignAndExport(
                originalState,
                40,
                { signer: signer3 },
            );

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });
    });

    describe('Multi-UTXO Signing', () => {
        it('should sign with multiple UTXOs', async () => {
            const params = {
                signer: defaultSigner,
                mldsaSigner: null,
                network,
                utxos: [
                    createTaprootUtxo(defaultAddress, 30000n, 'e'.repeat(64), 0),
                    createTaprootUtxo(defaultAddress, 40000n, 'f'.repeat(64), 1),
                    createTaprootUtxo(defaultAddress, 50000n, '1'.repeat(64), 2),
                ],
                from: defaultAddress,
                to: address2,
                feeRate: 12,
                priorityFee: 600n,
                gasSatFee: 400n,
                amount: 100000n,
            };

            const exportedState = OfflineTransactionManager.exportFunding(params);
            const inspected = OfflineTransactionManager.inspect(exportedState);
            expect(inspected.utxos).toHaveLength(3);

            const signedTxHex = await OfflineTransactionManager.importSignAndExport(exportedState, {
                signer: defaultSigner,
            });

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });
    });

    describe('Split Funding', () => {
        it('should sign split funding transaction', async () => {
            const params = {
                signer: defaultSigner,
                mldsaSigner: null,
                network,
                utxos: [createTaprootUtxo(defaultAddress, 200000n, '5'.repeat(64), 0)],
                from: defaultAddress,
                to: address2,
                feeRate: 10,
                priorityFee: 1000n,
                gasSatFee: 500n,
                amount: 150000n,
                splitInputsInto: 3,
            };

            const exportedState = OfflineTransactionManager.exportFunding(params);
            const inspected = OfflineTransactionManager.inspect(exportedState);
            expect(isFundingSpecificData(inspected.typeSpecificData)).toBe(true);

            const fundingData = inspected.typeSpecificData as FundingSpecificData;
            expect(fundingData.splitInputsInto).toBe(3);

            const signedTxHex = await OfflineTransactionManager.importSignAndExport(exportedState, {
                signer: defaultSigner,
            });

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });
    });

    describe('Address Rotation', () => {
        it('should sign with address rotation', async () => {
            const signerMap = createSignerMap([[defaultAddress, defaultSigner]]);

            const params = {
                signer: defaultSigner,
                mldsaSigner: null,
                network,
                utxos: [
                    createTaprootUtxo(defaultAddress, 50000n, '2'.repeat(64), 0),
                    createTaprootUtxo(defaultAddress, 60000n, '3'.repeat(64), 1),
                ],
                from: defaultAddress,
                to: address3,
                feeRate: 10,
                priorityFee: 500n,
                gasSatFee: 250n,
                amount: 80000n,
                addressRotation: createAddressRotation(signerMap),
            };

            const exportedState = OfflineTransactionManager.exportFunding(params);
            const inspected = OfflineTransactionManager.inspect(exportedState);
            expect(inspected.addressRotationEnabled).toBe(true);

            const signedTxHex = await OfflineTransactionManager.importSignAndExport(exportedState, {
                signer: defaultSigner,
                signerMap,
            });

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });
    });

    describe('Format Round-Trip', () => {
        it('should sign after base64 -> hex -> base64 conversion', async () => {
            const params = {
                signer: signer1,
                mldsaSigner: null,
                network,
                utxos: [createTaprootUtxo(address1, 75000n, '6'.repeat(64), 0)],
                from: address1,
                to: address3,
                feeRate: 20,
                priorityFee: 800n,
                gasSatFee: 400n,
                amount: 35000n,
            };

            const base64State = OfflineTransactionManager.exportFunding(params);
            const hexState = OfflineTransactionManager.toHex(base64State);
            expect(/^[0-9a-f]+$/i.test(hexState)).toBe(true);

            const backToBase64 = OfflineTransactionManager.fromHex(hexState);
            expect(OfflineTransactionManager.validate(base64State)).toBe(true);
            expect(OfflineTransactionManager.validate(backToBase64)).toBe(true);

            const signedTxHex = await OfflineTransactionManager.importSignAndExport(backToBase64, {
                signer: signer1,
            });

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });
    });

    describe('State Capture and Reconstruction', () => {
        it('should capture and reconstruct funding state', () => {
            const params = {
                signer: defaultSigner,
                mldsaSigner: null,
                network,
                utxos: [createTaprootUtxo(address1, 100000n)],
                from: address1,
                to: address2,
                feeRate: 10,
                priorityFee: 1000n,
                gasSatFee: 500n,
                amount: 50000n,
                splitInputsInto: 2,
            };

            const state = TransactionStateCapture.fromFunding(params);
            expect(state.header.transactionType).toBe(TransactionType.FUNDING);
            expect(state.baseParams.from).toBe(address1);
            expect(isFundingSpecificData(state.typeSpecificData)).toBe(true);

            const options: ReconstructionOptions = { signer: defaultSigner };
            const builder = TransactionReconstructor.reconstruct(state, options);
            expect(builder).toBeInstanceOf(FundingTransaction);
            expect(builder.type).toBe(TransactionType.FUNDING);
        });

        it('should preserve data through serialize/deserialize round-trip', () => {
            const originalState: ISerializableTransactionState = {
                header: {
                    formatVersion: SERIALIZATION_FORMAT_VERSION,
                    consensusVersion: currentConsensus,
                    transactionType: TransactionType.FUNDING,
                    chainId: ChainId.Bitcoin,
                    timestamp: 1700000000000,
                },
                baseParams: {
                    from: address1,
                    to: address2,
                    feeRate: 12.5,
                    priorityFee: '1500',
                    gasSatFee: '750',
                    networkName: 'regtest',
                    txVersion: 2,
                    note: 'deadbeef',
                    anchor: true,
                    debugFees: true,
                },
                utxos: [
                    {
                        transactionId: 'a'.repeat(64),
                        outputIndex: 3,
                        value: '123456',
                        scriptPubKeyHex: 'aa',
                        scriptPubKeyAddress: address1,
                        redeemScript: 'bb',
                        witnessScript: 'cc',
                        nonWitnessUtxo: 'dd',
                    },
                ],
                optionalInputs: [],
                optionalOutputs: [],
                addressRotationEnabled: false,
                signerMappings: [],
                typeSpecificData: {
                    type: TransactionType.FUNDING,
                    amount: '99999',
                    splitInputsInto: 3,
                },
                precomputedData: {
                    compiledTargetScript: '1234',
                    randomBytes: '5678',
                    estimatedFees: '1000',
                },
            };

            const serialized = TransactionSerializer.serialize(originalState);
            expect(serialized).toBeInstanceOf(Uint8Array);

            const deserialized = TransactionSerializer.deserialize(serialized);
            expect(deserialized.header.formatVersion).toBe(originalState.header.formatVersion);
            expect(deserialized.baseParams.from).toBe(originalState.baseParams.from);
            expect(deserialized.baseParams.feeRate).toBeCloseTo(
                originalState.baseParams.feeRate,
                3,
            );
            expect(deserialized.utxos).toEqual(originalState.utxos);
            expect(deserialized.typeSpecificData).toEqual(originalState.typeSpecificData);
            expect(deserialized.precomputedData).toEqual(originalState.precomputedData);
        });
    });

    describe('Message Signing', () => {
        it('should sign a message with a keypair', () => {
            const signed = MessageSigner.signMessage(signer1, 'Hello from the browser!');

            expect(signed).toBeDefined();
            expect(signed.signature).toBeDefined();
        });
    });
});
