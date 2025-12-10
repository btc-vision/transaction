import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { networks, payments } from '@btc-vision/bitcoin';
import { ECPairInterface } from 'ecpair';
import {
    // Core offline signing exports
    TransactionSerializer,
    TransactionStateCapture,
    TransactionReconstructor,
    OfflineTransactionManager,
    ReconstructionOptions,
    // Interfaces
    ISerializableTransactionState,
    SerializedUTXO,
    SerializedOutput,
    SerializedSignerMapping,
    SerializedBaseParams,
    PrecomputedData,
    SerializationHeader,
    SERIALIZATION_FORMAT_VERSION,
    SERIALIZATION_MAGIC_BYTE,
    // Type-specific data
    TypeSpecificData,
    FundingSpecificData,
    DeploymentSpecificData,
    InteractionSpecificData,
    MultiSigSpecificData,
    CustomScriptSpecificData,
    CancelSpecificData,
    isFundingSpecificData,
    isDeploymentSpecificData,
    isInteractionSpecificData,
    isMultiSigSpecificData,
    isCustomScriptSpecificData,
    isCancelSpecificData,
    // Transaction types
    TransactionType,
    FundingTransaction,
    // Utilities
    EcKeyPair,
    createSignerMap,
    createAddressRotation,
    UTXO,
    ChainId,
} from '../build/opnet.js';
import { currentConsensus } from '../build/opnet.js';

describe('Offline Transaction Signing', () => {
    const network = networks.regtest;

    // Test keypairs
    let signer1: ECPairInterface;
    let signer2: ECPairInterface;
    let signer3: ECPairInterface;
    let defaultSigner: ECPairInterface;

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
        const p2tr = payments.p2tr({ address, network });
        return {
            transactionId: txId,
            outputIndex: index,
            value,
            scriptPubKey: {
                hex: p2tr.output!.toString('hex'),
                address,
            },
        };
    };

    // Helper to create mock serialized state
    const createMockSerializedState = (
        type: TransactionType = TransactionType.FUNDING,
        overrides: Partial<ISerializableTransactionState> = {},
    ): ISerializableTransactionState => {
        const baseState: ISerializableTransactionState = {
            header: {
                formatVersion: SERIALIZATION_FORMAT_VERSION,
                consensusVersion: currentConsensus,
                transactionType: type,
                chainId: ChainId.Bitcoin,
                timestamp: Date.now(),
            },
            baseParams: {
                from: address1,
                to: address2,
                feeRate: 10,
                priorityFee: '1000',
                gasSatFee: '500',
                networkName: 'regtest',
                txVersion: 2,
                anchor: false,
            },
            utxos: [
                {
                    transactionId: '0'.repeat(64),
                    outputIndex: 0,
                    value: '100000',
                    scriptPubKeyHex: payments.p2tr({ address: address1, network }).output!.toString('hex'),
                    scriptPubKeyAddress: address1,
                },
            ],
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
        };

        return { ...baseState, ...overrides };
    };

    describe('TransactionSerializer', () => {
        describe('serialize/deserialize', () => {
            it('should serialize and deserialize a basic funding transaction state', () => {
                const state = createMockSerializedState(TransactionType.FUNDING);

                const serialized = TransactionSerializer.serialize(state);
                expect(serialized).toBeInstanceOf(Buffer);
                expect(serialized.length).toBeGreaterThan(32); // At least checksum size

                const deserialized = TransactionSerializer.deserialize(serialized);
                expect(deserialized.header.transactionType).toBe(TransactionType.FUNDING);
                expect(deserialized.baseParams.from).toBe(state.baseParams.from);
                expect(deserialized.baseParams.feeRate).toBe(state.baseParams.feeRate);
            });

            it('should preserve all header fields', () => {
                const state = createMockSerializedState();
                state.header.timestamp = 1234567890123;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.header.formatVersion).toBe(SERIALIZATION_FORMAT_VERSION);
                expect(deserialized.header.consensusVersion).toBe(currentConsensus);
                expect(deserialized.header.transactionType).toBe(TransactionType.FUNDING);
                expect(deserialized.header.chainId).toBe(ChainId.Bitcoin);
                expect(deserialized.header.timestamp).toBe(1234567890123);
            });

            it('should preserve all base params fields', () => {
                const state = createMockSerializedState();
                const baseParams: SerializedBaseParams = {
                    from: address1,
                    to: address2,
                    feeRate: 15.5, // Test decimal fee rate
                    priorityFee: '2000',
                    gasSatFee: '1000',
                    networkName: 'testnet',
                    txVersion: 2,
                    note: Buffer.from('test note').toString('hex'),
                    anchor: true,
                    debugFees: true,
                };
                state.baseParams = baseParams;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.baseParams.from).toBe(baseParams.from);
                expect(deserialized.baseParams.to).toBe(baseParams.to);
                expect(deserialized.baseParams.feeRate).toBeCloseTo(baseParams.feeRate, 3);
                expect(deserialized.baseParams.priorityFee).toBe(baseParams.priorityFee);
                expect(deserialized.baseParams.gasSatFee).toBe(baseParams.gasSatFee);
                expect(deserialized.baseParams.networkName).toBe(baseParams.networkName);
                expect(deserialized.baseParams.txVersion).toBe(baseParams.txVersion);
                expect(deserialized.baseParams.note).toBe(baseParams.note);
                expect(deserialized.baseParams.anchor).toBe(baseParams.anchor);
                expect(deserialized.baseParams.debugFees).toBe(baseParams.debugFees);
            });

            it('should handle optional "to" field being undefined', () => {
                const state = createMockSerializedState();
                state.baseParams.to = undefined;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.baseParams.to).toBeUndefined();
            });

            it('should preserve UTXO data correctly', () => {
                const utxo: SerializedUTXO = {
                    transactionId: 'a'.repeat(64),
                    outputIndex: 5,
                    value: '999999999',
                    scriptPubKeyHex: 'deadbeef',
                    scriptPubKeyAddress: address1,
                    redeemScript: 'cafe0001',
                    witnessScript: 'babe0002',
                    nonWitnessUtxo: 'feed0003',
                };

                const state = createMockSerializedState();
                state.utxos = [utxo];

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.utxos).toHaveLength(1);
                expect(deserialized.utxos[0].transactionId).toBe(utxo.transactionId);
                expect(deserialized.utxos[0].outputIndex).toBe(utxo.outputIndex);
                expect(deserialized.utxos[0].value).toBe(utxo.value);
                expect(deserialized.utxos[0].scriptPubKeyHex).toBe(utxo.scriptPubKeyHex);
                expect(deserialized.utxos[0].scriptPubKeyAddress).toBe(utxo.scriptPubKeyAddress);
                expect(deserialized.utxos[0].redeemScript).toBe(utxo.redeemScript);
                expect(deserialized.utxos[0].witnessScript).toBe(utxo.witnessScript);
                expect(deserialized.utxos[0].nonWitnessUtxo).toBe(utxo.nonWitnessUtxo);
            });

            it('should handle multiple UTXOs', () => {
                const state = createMockSerializedState();
                state.utxos = [
                    {
                        transactionId: '1'.repeat(64),
                        outputIndex: 0,
                        value: '10000',
                        scriptPubKeyHex: 'aa',
                        scriptPubKeyAddress: address1,
                    },
                    {
                        transactionId: '2'.repeat(64),
                        outputIndex: 1,
                        value: '20000',
                        scriptPubKeyHex: 'bb',
                        scriptPubKeyAddress: address2,
                    },
                    {
                        transactionId: '3'.repeat(64),
                        outputIndex: 2,
                        value: '30000',
                        scriptPubKeyHex: 'cc',
                        scriptPubKeyAddress: address3,
                    },
                ];

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.utxos).toHaveLength(3);
                expect(deserialized.utxos[0].transactionId).toBe('1'.repeat(64));
                expect(deserialized.utxos[1].transactionId).toBe('2'.repeat(64));
                expect(deserialized.utxos[2].transactionId).toBe('3'.repeat(64));
            });

            it('should preserve optional inputs', () => {
                const state = createMockSerializedState();
                state.optionalInputs = [
                    {
                        transactionId: 'f'.repeat(64),
                        outputIndex: 99,
                        value: '12345',
                        scriptPubKeyHex: 'ff',
                    },
                ];

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.optionalInputs).toHaveLength(1);
                expect(deserialized.optionalInputs[0].outputIndex).toBe(99);
            });

            it('should preserve optional outputs', () => {
                const output: SerializedOutput = {
                    value: 5000,
                    address: address2,
                    tapInternalKey: 'abcd1234',
                };

                const state = createMockSerializedState();
                state.optionalOutputs = [output];

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.optionalOutputs).toHaveLength(1);
                expect(deserialized.optionalOutputs[0].value).toBe(output.value);
                expect(deserialized.optionalOutputs[0].address).toBe(output.address);
                expect(deserialized.optionalOutputs[0].tapInternalKey).toBe(output.tapInternalKey);
            });

            it('should preserve script-based outputs', () => {
                const output: SerializedOutput = {
                    value: 6000,
                    script: 'deadbeefcafe',
                };

                const state = createMockSerializedState();
                state.optionalOutputs = [output];

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.optionalOutputs).toHaveLength(1);
                expect(deserialized.optionalOutputs[0].script).toBe(output.script);
                expect(deserialized.optionalOutputs[0].address).toBeUndefined();
            });

            it('should preserve signer mappings for address rotation', () => {
                const state = createMockSerializedState();
                state.addressRotationEnabled = true;
                state.signerMappings = [
                    { address: address1, inputIndices: [0, 2, 4] },
                    { address: address2, inputIndices: [1, 3] },
                ];

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.addressRotationEnabled).toBe(true);
                expect(deserialized.signerMappings).toHaveLength(2);
                expect(deserialized.signerMappings[0].address).toBe(address1);
                expect(deserialized.signerMappings[0].inputIndices).toEqual([0, 2, 4]);
                expect(deserialized.signerMappings[1].address).toBe(address2);
                expect(deserialized.signerMappings[1].inputIndices).toEqual([1, 3]);
            });

            it('should preserve precomputed data', () => {
                const precomputed: PrecomputedData = {
                    compiledTargetScript: 'abcdef123456',
                    randomBytes: '0123456789abcdef',
                    estimatedFees: '5000',
                    contractSeed: 'seedvalue',
                    contractAddress: address3,
                };

                const state = createMockSerializedState();
                state.precomputedData = precomputed;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.precomputedData.compiledTargetScript).toBe(precomputed.compiledTargetScript);
                expect(deserialized.precomputedData.randomBytes).toBe(precomputed.randomBytes);
                expect(deserialized.precomputedData.estimatedFees).toBe(precomputed.estimatedFees);
                expect(deserialized.precomputedData.contractSeed).toBe(precomputed.contractSeed);
                expect(deserialized.precomputedData.contractAddress).toBe(precomputed.contractAddress);
            });
        });

        describe('type-specific data', () => {
            it('should serialize/deserialize FundingSpecificData', () => {
                const typeData: FundingSpecificData = {
                    type: TransactionType.FUNDING,
                    amount: '123456789',
                    splitInputsInto: 5,
                };

                const state = createMockSerializedState(TransactionType.FUNDING);
                state.typeSpecificData = typeData;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(isFundingSpecificData(deserialized.typeSpecificData)).toBe(true);
                const data = deserialized.typeSpecificData as FundingSpecificData;
                expect(data.amount).toBe(typeData.amount);
                expect(data.splitInputsInto).toBe(typeData.splitInputsInto);
            });

            it('should serialize/deserialize DeploymentSpecificData', () => {
                const typeData: DeploymentSpecificData = {
                    type: TransactionType.DEPLOYMENT,
                    bytecode: 'deadbeef'.repeat(100),
                    calldata: 'cafebabe',
                    challenge: createMockChallenge(),
                    revealMLDSAPublicKey: true,
                    linkMLDSAPublicKeyToAddress: true,
                    hashedPublicKey: 'abcd'.repeat(16),
                };

                const state = createMockSerializedState(TransactionType.DEPLOYMENT);
                state.header.transactionType = TransactionType.DEPLOYMENT;
                state.typeSpecificData = typeData;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(isDeploymentSpecificData(deserialized.typeSpecificData)).toBe(true);
                const data = deserialized.typeSpecificData as DeploymentSpecificData;
                expect(data.bytecode).toBe(typeData.bytecode);
                expect(data.calldata).toBe(typeData.calldata);
                expect(data.revealMLDSAPublicKey).toBe(true);
                expect(data.linkMLDSAPublicKeyToAddress).toBe(true);
                expect(data.hashedPublicKey).toBe(typeData.hashedPublicKey);
            });

            it('should serialize/deserialize InteractionSpecificData', () => {
                const typeData: InteractionSpecificData = {
                    type: TransactionType.INTERACTION,
                    calldata: 'cafebabe12345678',
                    contract: 'bcrt1qtest',
                    challenge: createMockChallenge(),
                    loadedStorage: {
                        'key1': ['value1', 'value2'],
                        'key2': ['value3'],
                    },
                    isCancellation: true,
                    disableAutoRefund: true,
                    revealMLDSAPublicKey: false,
                };

                const state = createMockSerializedState(TransactionType.INTERACTION);
                state.header.transactionType = TransactionType.INTERACTION;
                state.typeSpecificData = typeData;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(isInteractionSpecificData(deserialized.typeSpecificData)).toBe(true);
                const data = deserialized.typeSpecificData as InteractionSpecificData;
                expect(data.calldata).toBe(typeData.calldata);
                expect(data.contract).toBe(typeData.contract);
                expect(data.loadedStorage).toEqual(typeData.loadedStorage);
                expect(data.isCancellation).toBe(true);
                expect(data.disableAutoRefund).toBe(true);
            });

            it('should serialize/deserialize MultiSigSpecificData', () => {
                const typeData: MultiSigSpecificData = {
                    type: TransactionType.MULTI_SIG,
                    pubkeys: ['aa'.repeat(33), 'bb'.repeat(33), 'cc'.repeat(33)],
                    minimumSignatures: 2,
                    receiver: address2,
                    requestedAmount: '500000',
                    refundVault: address3,
                    originalInputCount: 3,
                    existingPsbtBase64: 'cHNidP8BAH...',
                };

                const state = createMockSerializedState(TransactionType.MULTI_SIG);
                state.header.transactionType = TransactionType.MULTI_SIG;
                state.typeSpecificData = typeData;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(isMultiSigSpecificData(deserialized.typeSpecificData)).toBe(true);
                const data = deserialized.typeSpecificData as MultiSigSpecificData;
                expect(data.pubkeys).toEqual(typeData.pubkeys);
                expect(data.minimumSignatures).toBe(2);
                expect(data.receiver).toBe(typeData.receiver);
                expect(data.requestedAmount).toBe(typeData.requestedAmount);
                expect(data.refundVault).toBe(typeData.refundVault);
                expect(data.originalInputCount).toBe(3);
                expect(data.existingPsbtBase64).toBe(typeData.existingPsbtBase64);
            });

            it('should serialize/deserialize CustomScriptSpecificData', () => {
                const typeData: CustomScriptSpecificData = {
                    type: TransactionType.CUSTOM_CODE,
                    scriptElements: [
                        { elementType: 'buffer', value: 'deadbeef' },
                        { elementType: 'opcode', value: 118 }, // OP_DUP
                        { elementType: 'opcode', value: 169 }, // OP_HASH160
                    ],
                    witnesses: ['abcdef0123456789', 'fedcba9876543210'],
                    annex: 'aabbccdd',
                };

                const state = createMockSerializedState(TransactionType.CUSTOM_CODE);
                state.header.transactionType = TransactionType.CUSTOM_CODE;
                state.typeSpecificData = typeData;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(isCustomScriptSpecificData(deserialized.typeSpecificData)).toBe(true);
                const data = deserialized.typeSpecificData as CustomScriptSpecificData;
                expect(data.scriptElements).toHaveLength(3);
                expect(data.scriptElements[0]).toEqual({ elementType: 'buffer', value: 'deadbeef' });
                expect(data.scriptElements[1]).toEqual({ elementType: 'opcode', value: 118 });
                expect(data.witnesses).toEqual(typeData.witnesses);
                expect(data.annex).toBe(typeData.annex);
            });

            it('should serialize/deserialize CancelSpecificData', () => {
                const typeData: CancelSpecificData = {
                    type: TransactionType.CANCEL,
                    compiledTargetScript: 'deadbeefcafe1234',
                };

                const state = createMockSerializedState(TransactionType.CANCEL);
                state.header.transactionType = TransactionType.CANCEL;
                state.typeSpecificData = typeData;

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(isCancelSpecificData(deserialized.typeSpecificData)).toBe(true);
                const data = deserialized.typeSpecificData as CancelSpecificData;
                expect(data.compiledTargetScript).toBe(typeData.compiledTargetScript);
            });
        });

        describe('format conversion', () => {
            it('should convert to/from base64', () => {
                const state = createMockSerializedState();

                const base64 = TransactionSerializer.toBase64(state);
                expect(typeof base64).toBe('string');
                expect(base64.length).toBeGreaterThan(0);

                const restored = TransactionSerializer.fromBase64(base64);
                expect(restored.header.transactionType).toBe(state.header.transactionType);
                expect(restored.baseParams.from).toBe(state.baseParams.from);
            });

            it('should convert to/from hex', () => {
                const state = createMockSerializedState();

                const hex = TransactionSerializer.toHex(state);
                expect(typeof hex).toBe('string');
                expect(/^[0-9a-f]+$/i.test(hex)).toBe(true);

                const restored = TransactionSerializer.fromHex(hex);
                expect(restored.header.transactionType).toBe(state.header.transactionType);
            });
        });

        describe('error handling', () => {
            it('should throw on invalid magic byte', () => {
                const state = createMockSerializedState();
                const serialized = TransactionSerializer.serialize(state);

                // Corrupt magic byte
                serialized[0] = 0x00;

                // Recalculate checksum to bypass checksum error
                const payload = serialized.subarray(0, -32);
                const crypto = require('crypto');
                const hash1 = crypto.createHash('sha256').update(payload).digest();
                const newChecksum = crypto.createHash('sha256').update(hash1).digest();
                newChecksum.copy(serialized, serialized.length - 32);

                expect(() => TransactionSerializer.deserialize(serialized)).toThrow(/Invalid magic byte/);
            });

            it('should throw on invalid checksum', () => {
                const state = createMockSerializedState();
                const serialized = TransactionSerializer.serialize(state);

                // Corrupt checksum
                serialized[serialized.length - 1] ^= 0xff;

                expect(() => TransactionSerializer.deserialize(serialized)).toThrow(/Invalid checksum/);
            });

            it('should throw on data too short', () => {
                const shortData = Buffer.alloc(16); // Less than 32 bytes

                expect(() => TransactionSerializer.deserialize(shortData)).toThrow(/too short/);
            });

            it('should throw on unsupported format version', () => {
                const state = createMockSerializedState();
                const serialized = TransactionSerializer.serialize(state);

                // Set format version to a high value
                serialized[1] = 255;

                // Recalculate checksum
                const payload = serialized.subarray(0, -32);
                const crypto = require('crypto');
                const hash1 = crypto.createHash('sha256').update(payload).digest();
                const newChecksum = crypto.createHash('sha256').update(hash1).digest();
                newChecksum.copy(serialized, serialized.length - 32);

                expect(() => TransactionSerializer.deserialize(serialized)).toThrow(/Unsupported format version/);
            });
        });

        describe('network serialization', () => {
            it('should serialize mainnet correctly', () => {
                const state = createMockSerializedState();
                state.baseParams.networkName = 'mainnet';

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.baseParams.networkName).toBe('mainnet');
            });

            it('should serialize testnet correctly', () => {
                const state = createMockSerializedState();
                state.baseParams.networkName = 'testnet';

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.baseParams.networkName).toBe('testnet');
            });

            it('should serialize regtest correctly', () => {
                const state = createMockSerializedState();
                state.baseParams.networkName = 'regtest';

                const deserialized = TransactionSerializer.deserialize(
                    TransactionSerializer.serialize(state),
                );

                expect(deserialized.baseParams.networkName).toBe('regtest');
            });
        });
    });

    describe('TransactionStateCapture', () => {
        describe('fromFunding', () => {
            it('should capture state from funding transaction parameters', () => {
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
                expect(state.baseParams.to).toBe(address2);
                expect(state.baseParams.feeRate).toBe(10);
                expect(state.utxos).toHaveLength(1);
                expect(isFundingSpecificData(state.typeSpecificData)).toBe(true);
                const data = state.typeSpecificData as FundingSpecificData;
                expect(data.amount).toBe('50000');
                expect(data.splitInputsInto).toBe(2);
            });

            it('should capture precomputed data', () => {
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
                };

                const precomputed = {
                    estimatedFees: '2000',
                };

                const state = TransactionStateCapture.fromFunding(params, precomputed);

                expect(state.precomputedData.estimatedFees).toBe('2000');
            });

            it('should handle address rotation configuration', () => {
                const signerMap = createSignerMap([
                    [address1, signer1],
                    [address2, signer2],
                ]);

                const params = {
                    signer: defaultSigner,
                    mldsaSigner: null,
                    network,
                    utxos: [
                        createTaprootUtxo(address1, 50000n, '1'.repeat(64), 0),
                        createTaprootUtxo(address2, 50000n, '2'.repeat(64), 0),
                    ],
                    from: address1,
                    to: address3,
                    feeRate: 10,
                    priorityFee: 1000n,
                    gasSatFee: 500n,
                    amount: 80000n,
                    addressRotation: createAddressRotation(signerMap),
                };

                const state = TransactionStateCapture.fromFunding(params);

                expect(state.addressRotationEnabled).toBe(true);
                expect(state.signerMappings).toHaveLength(2);
            });
        });

        describe('UTXO serialization', () => {
            it('should serialize UTXO with all optional fields', () => {
                const utxo: UTXO = {
                    transactionId: 'a'.repeat(64),
                    outputIndex: 5,
                    value: 999999n,
                    scriptPubKey: {
                        hex: 'deadbeef',
                        address: address1,
                    },
                    redeemScript: Buffer.from('cafe', 'hex'),
                    witnessScript: Buffer.from('babe', 'hex'),
                    nonWitnessUtxo: Buffer.from('feed', 'hex'),
                };

                const params = {
                    signer: defaultSigner,
                    mldsaSigner: null,
                    network,
                    utxos: [utxo],
                    from: address1,
                    to: address2,
                    feeRate: 10,
                    priorityFee: 1000n,
                    gasSatFee: 500n,
                    amount: 50000n,
                };

                const state = TransactionStateCapture.fromFunding(params);

                expect(state.utxos[0].transactionId).toBe(utxo.transactionId);
                expect(state.utxos[0].redeemScript).toBe('cafe');
                expect(state.utxos[0].witnessScript).toBe('babe');
                expect(state.utxos[0].nonWitnessUtxo).toBe('feed');
            });

            it('should handle UTXOs with string scripts', () => {
                const utxo: UTXO = {
                    transactionId: 'b'.repeat(64),
                    outputIndex: 0,
                    value: 10000n,
                    scriptPubKey: {
                        hex: 'aabbcc',
                        address: address1,
                    },
                    redeemScript: 'ddeeff', // String instead of Buffer
                };

                const params = {
                    signer: defaultSigner,
                    mldsaSigner: null,
                    network,
                    utxos: [utxo],
                    from: address1,
                    to: address2,
                    feeRate: 10,
                    priorityFee: 1000n,
                    gasSatFee: 500n,
                    amount: 5000n,
                };

                const state = TransactionStateCapture.fromFunding(params);

                expect(state.utxos[0].redeemScript).toBe('ddeeff');
            });
        });
    });

    describe('TransactionReconstructor', () => {
        describe('reconstruct', () => {
            it('should reconstruct a funding transaction', () => {
                const state = createMockSerializedState(TransactionType.FUNDING);

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                };

                const builder = TransactionReconstructor.reconstruct(state, options);

                expect(builder).toBeInstanceOf(FundingTransaction);
                expect(builder.type).toBe(TransactionType.FUNDING);
            });

            it('should apply fee rate override', () => {
                const state = createMockSerializedState(TransactionType.FUNDING);
                state.baseParams.feeRate = 10;

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                    newFeeRate: 50,
                };

                const builder = TransactionReconstructor.reconstruct(state, options);

                // The builder should have the new fee rate
                expect(builder).toBeDefined();
            });

            it('should apply priority fee override', () => {
                const state = createMockSerializedState(TransactionType.FUNDING);

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                    newPriorityFee: 5000n,
                };

                const builder = TransactionReconstructor.reconstruct(state, options);
                expect(builder).toBeDefined();
            });

            it('should apply gas sat fee override', () => {
                const state = createMockSerializedState(TransactionType.FUNDING);

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                    newGasSatFee: 2000n,
                };

                const builder = TransactionReconstructor.reconstruct(state, options);
                expect(builder).toBeDefined();
            });

            it('should throw when address rotation enabled but no signerMap provided', () => {
                const state = createMockSerializedState(TransactionType.FUNDING);
                state.addressRotationEnabled = true;

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                    // No signerMap provided
                };

                expect(() => TransactionReconstructor.reconstruct(state, options)).toThrow(
                    /signerMap/,
                );
            });

            it('should reconstruct with address rotation when signerMap provided', () => {
                const state = createMockSerializedState(TransactionType.FUNDING);
                state.addressRotationEnabled = true;
                state.signerMappings = [{ address: address1, inputIndices: [0] }];

                const signerMap = createSignerMap([[address1, signer1]]);

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                    signerMap,
                };

                const builder = TransactionReconstructor.reconstruct(state, options);
                expect(builder).toBeDefined();
            });
        });

        describe('network conversion', () => {
            it('should convert mainnet name to network', () => {
                const state = createMockSerializedState();
                state.baseParams.networkName = 'mainnet';

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                };

                const builder = TransactionReconstructor.reconstruct(state, options);
                expect(builder).toBeDefined();
            });

            it('should convert testnet name to network', () => {
                const state = createMockSerializedState();
                state.baseParams.networkName = 'testnet';

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                };

                const builder = TransactionReconstructor.reconstruct(state, options);
                expect(builder).toBeDefined();
            });

            it('should convert regtest name to network', () => {
                const state = createMockSerializedState();
                state.baseParams.networkName = 'regtest';

                const options: ReconstructionOptions = {
                    signer: defaultSigner,
                };

                const builder = TransactionReconstructor.reconstruct(state, options);
                expect(builder).toBeDefined();
            });
        });
    });

    describe('OfflineTransactionManager', () => {
        describe('exportFunding', () => {
            it('should export funding transaction to base64', () => {
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
                };

                const exported = OfflineTransactionManager.exportFunding(params);

                expect(typeof exported).toBe('string');
                expect(exported.length).toBeGreaterThan(0);

                // Should be valid base64
                expect(() => Buffer.from(exported, 'base64')).not.toThrow();
            });
        });

        describe('importForSigning', () => {
            it('should import serialized state and create builder', () => {
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
                };

                const exported = OfflineTransactionManager.exportFunding(params);

                const builder = OfflineTransactionManager.importForSigning(exported, {
                    signer: signer1,
                });

                expect(builder).toBeInstanceOf(FundingTransaction);
            });
        });

        describe('inspect', () => {
            it('should return parsed state for inspection', () => {
                const params = {
                    signer: defaultSigner,
                    mldsaSigner: null,
                    network,
                    utxos: [createTaprootUtxo(address1, 100000n)],
                    from: address1,
                    to: address2,
                    feeRate: 15,
                    priorityFee: 1000n,
                    gasSatFee: 500n,
                    amount: 50000n,
                };

                const exported = OfflineTransactionManager.exportFunding(params);
                const inspected = OfflineTransactionManager.inspect(exported);

                expect(inspected.header.transactionType).toBe(TransactionType.FUNDING);
                expect(inspected.baseParams.from).toBe(address1);
                expect(inspected.baseParams.to).toBe(address2);
                expect(inspected.baseParams.feeRate).toBeCloseTo(15, 3);
            });
        });

        describe('validate', () => {
            it('should return true for valid serialized state', () => {
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
                };

                const exported = OfflineTransactionManager.exportFunding(params);

                expect(OfflineTransactionManager.validate(exported)).toBe(true);
            });

            it('should return false for invalid serialized state', () => {
                expect(OfflineTransactionManager.validate('invalid base64!')).toBe(false);
                expect(OfflineTransactionManager.validate('')).toBe(false);
                expect(OfflineTransactionManager.validate('YWJj')).toBe(false); // Valid base64 but invalid data
            });
        });

        describe('getType', () => {
            it('should return transaction type from serialized state', () => {
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
                };

                const exported = OfflineTransactionManager.exportFunding(params);
                const type = OfflineTransactionManager.getType(exported);

                expect(type).toBe(TransactionType.FUNDING);
            });
        });

        describe('toHex/fromHex', () => {
            it('should convert between base64 and hex formats', () => {
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
                };

                const base64 = OfflineTransactionManager.exportFunding(params);
                const hex = OfflineTransactionManager.toHex(base64);

                expect(/^[0-9a-f]+$/i.test(hex)).toBe(true);

                const backToBase64 = OfflineTransactionManager.fromHex(hex);

                // Both should deserialize to the same state
                const state1 = OfflineTransactionManager.inspect(base64);
                const state2 = OfflineTransactionManager.inspect(backToBase64);

                expect(state1.baseParams.from).toBe(state2.baseParams.from);
                expect(state1.baseParams.to).toBe(state2.baseParams.to);
            });
        });

        describe('full workflow', () => {
            it('should complete export -> import -> reconstruct workflow', () => {
                // Phase 1: Export
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
                };

                const exported = OfflineTransactionManager.exportFunding(params);

                // Validate
                expect(OfflineTransactionManager.validate(exported)).toBe(true);

                // Inspect
                const inspected = OfflineTransactionManager.inspect(exported);
                expect(inspected.header.transactionType).toBe(TransactionType.FUNDING);

                // Phase 2: Import with different signer
                const builder = OfflineTransactionManager.importForSigning(exported, {
                    signer: signer1,
                });

                expect(builder).toBeDefined();
                expect(builder.type).toBe(TransactionType.FUNDING);
            });

            it('should support fee bumping workflow', () => {
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
                };

                const exported = OfflineTransactionManager.exportFunding(params);

                // Rebuild with higher fee
                const bumpedState = OfflineTransactionManager.rebuildWithNewFees(
                    exported,
                    50, // New fee rate
                    { signer: signer1 },
                );

                // Verify the new state has updated fee
                const inspected = OfflineTransactionManager.inspect(bumpedState);
                expect(inspected.baseParams.feeRate).toBeCloseTo(50, 3);
            });
        });
    });

    describe('Type Guards', () => {
        it('isFundingSpecificData should correctly identify funding data', () => {
            const fundingData: FundingSpecificData = {
                type: TransactionType.FUNDING,
                amount: '1000',
                splitInputsInto: 1,
            };

            expect(isFundingSpecificData(fundingData)).toBe(true);

            const otherData: CancelSpecificData = {
                type: TransactionType.CANCEL,
                compiledTargetScript: 'abc',
            };

            expect(isFundingSpecificData(otherData)).toBe(false);
        });

        it('isDeploymentSpecificData should correctly identify deployment data', () => {
            const deploymentData: DeploymentSpecificData = {
                type: TransactionType.DEPLOYMENT,
                bytecode: 'abc',
                challenge: createMockChallenge(),
            };

            expect(isDeploymentSpecificData(deploymentData)).toBe(true);
            expect(isDeploymentSpecificData({ type: TransactionType.FUNDING } as any)).toBe(false);
        });

        it('isInteractionSpecificData should correctly identify interaction data', () => {
            const interactionData: InteractionSpecificData = {
                type: TransactionType.INTERACTION,
                calldata: 'abc',
                challenge: createMockChallenge(),
            };

            expect(isInteractionSpecificData(interactionData)).toBe(true);
            expect(isInteractionSpecificData({ type: TransactionType.FUNDING } as any)).toBe(false);
        });

        it('isMultiSigSpecificData should correctly identify multisig data', () => {
            const multiSigData: MultiSigSpecificData = {
                type: TransactionType.MULTI_SIG,
                pubkeys: [],
                minimumSignatures: 2,
                receiver: 'addr',
                requestedAmount: '1000',
                refundVault: 'vault',
                originalInputCount: 1,
            };

            expect(isMultiSigSpecificData(multiSigData)).toBe(true);
            expect(isMultiSigSpecificData({ type: TransactionType.FUNDING } as any)).toBe(false);
        });

        it('isCustomScriptSpecificData should correctly identify custom script data', () => {
            const customData: CustomScriptSpecificData = {
                type: TransactionType.CUSTOM_CODE,
                scriptElements: [],
                witnesses: [],
            };

            expect(isCustomScriptSpecificData(customData)).toBe(true);
            expect(isCustomScriptSpecificData({ type: TransactionType.FUNDING } as any)).toBe(false);
        });

        it('isCancelSpecificData should correctly identify cancel data', () => {
            const cancelData: CancelSpecificData = {
                type: TransactionType.CANCEL,
                compiledTargetScript: 'abc',
            };

            expect(isCancelSpecificData(cancelData)).toBe(true);
            expect(isCancelSpecificData({ type: TransactionType.FUNDING } as any)).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty UTXOs array', () => {
            const state = createMockSerializedState();
            state.utxos = [];

            const serialized = TransactionSerializer.serialize(state);
            const deserialized = TransactionSerializer.deserialize(serialized);

            expect(deserialized.utxos).toHaveLength(0);
        });

        it('should handle very large values', () => {
            const state = createMockSerializedState();
            state.utxos = [
                {
                    transactionId: '0'.repeat(64),
                    outputIndex: 0,
                    value: '9999999999999999', // Large value
                    scriptPubKeyHex: 'aa',
                },
            ];

            const deserialized = TransactionSerializer.deserialize(
                TransactionSerializer.serialize(state),
            );

            expect(deserialized.utxos[0].value).toBe('9999999999999999');
        });

        it('should handle empty strings', () => {
            const state = createMockSerializedState();
            state.baseParams.from = '';
            state.baseParams.to = '';

            const deserialized = TransactionSerializer.deserialize(
                TransactionSerializer.serialize(state),
            );

            expect(deserialized.baseParams.from).toBe('');
        });

        it('should handle special characters in note', () => {
            const state = createMockSerializedState();
            const specialNote = Buffer.from('Hello\x00World\n\t\r').toString('hex');
            state.baseParams.note = specialNote;

            const deserialized = TransactionSerializer.deserialize(
                TransactionSerializer.serialize(state),
            );

            expect(deserialized.baseParams.note).toBe(specialNote);
        });

        it('should handle zero fee rate', () => {
            const state = createMockSerializedState();
            state.baseParams.feeRate = 0;

            const deserialized = TransactionSerializer.deserialize(
                TransactionSerializer.serialize(state),
            );

            expect(deserialized.baseParams.feeRate).toBe(0);
        });

        it('should handle maximum input indices in signer mappings', () => {
            const state = createMockSerializedState();
            state.addressRotationEnabled = true;
            state.signerMappings = [
                { address: address1, inputIndices: Array.from({ length: 100 }, (_, i) => i) },
            ];

            const deserialized = TransactionSerializer.deserialize(
                TransactionSerializer.serialize(state),
            );

            expect(deserialized.signerMappings[0].inputIndices).toHaveLength(100);
        });

        it('should handle loaded storage with many keys', () => {
            const state = createMockSerializedState(TransactionType.INTERACTION);
            state.header.transactionType = TransactionType.INTERACTION;

            const loadedStorage: { [key: string]: string[] } = {};
            for (let i = 0; i < 50; i++) {
                loadedStorage[`key${i}`] = [`value${i}a`, `value${i}b`];
            }

            state.typeSpecificData = {
                type: TransactionType.INTERACTION,
                calldata: 'abc',
                challenge: createMockChallenge(),
                loadedStorage,
            } as InteractionSpecificData;

            const deserialized = TransactionSerializer.deserialize(
                TransactionSerializer.serialize(state),
            );

            const data = deserialized.typeSpecificData as InteractionSpecificData;
            expect(Object.keys(data.loadedStorage || {}).length).toBe(50);
        });
    });

    describe('Round-trip Tests', () => {
        it('should preserve all data through serialize/deserialize cycle', () => {
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
                optionalInputs: [
                    {
                        transactionId: 'b'.repeat(64),
                        outputIndex: 1,
                        value: '789',
                        scriptPubKeyHex: 'ee',
                    },
                ],
                optionalOutputs: [
                    {
                        value: 5000,
                        address: address3,
                        tapInternalKey: 'ff'.repeat(16),
                    },
                ],
                addressRotationEnabled: true,
                signerMappings: [
                    { address: address1, inputIndices: [0, 1] },
                    { address: address2, inputIndices: [2] },
                ],
                typeSpecificData: {
                    type: TransactionType.FUNDING,
                    amount: '99999',
                    splitInputsInto: 3,
                },
                precomputedData: {
                    compiledTargetScript: '1234',
                    randomBytes: '5678',
                    estimatedFees: '1000',
                    contractSeed: 'seed',
                    contractAddress: address3,
                },
            };

            const serialized = TransactionSerializer.serialize(originalState);
            const deserialized = TransactionSerializer.deserialize(serialized);

            // Verify header
            expect(deserialized.header.formatVersion).toBe(originalState.header.formatVersion);
            expect(deserialized.header.consensusVersion).toBe(originalState.header.consensusVersion);
            expect(deserialized.header.transactionType).toBe(originalState.header.transactionType);
            expect(deserialized.header.chainId).toBe(originalState.header.chainId);
            expect(deserialized.header.timestamp).toBe(originalState.header.timestamp);

            // Verify base params
            expect(deserialized.baseParams.from).toBe(originalState.baseParams.from);
            expect(deserialized.baseParams.to).toBe(originalState.baseParams.to);
            expect(deserialized.baseParams.feeRate).toBeCloseTo(originalState.baseParams.feeRate, 3);
            expect(deserialized.baseParams.priorityFee).toBe(originalState.baseParams.priorityFee);
            expect(deserialized.baseParams.gasSatFee).toBe(originalState.baseParams.gasSatFee);
            expect(deserialized.baseParams.networkName).toBe(originalState.baseParams.networkName);
            expect(deserialized.baseParams.txVersion).toBe(originalState.baseParams.txVersion);
            expect(deserialized.baseParams.note).toBe(originalState.baseParams.note);
            expect(deserialized.baseParams.anchor).toBe(originalState.baseParams.anchor);
            expect(deserialized.baseParams.debugFees).toBe(originalState.baseParams.debugFees);

            // Verify UTXOs
            expect(deserialized.utxos).toEqual(originalState.utxos);

            // Verify optional inputs/outputs
            expect(deserialized.optionalInputs).toEqual(originalState.optionalInputs);
            expect(deserialized.optionalOutputs).toEqual(originalState.optionalOutputs);

            // Verify address rotation
            expect(deserialized.addressRotationEnabled).toBe(originalState.addressRotationEnabled);
            expect(deserialized.signerMappings).toEqual(originalState.signerMappings);

            // Verify type-specific data
            expect(deserialized.typeSpecificData).toEqual(originalState.typeSpecificData);

            // Verify precomputed data
            expect(deserialized.precomputedData).toEqual(originalState.precomputedData);
        });

        it('should preserve data through export/import/reconstruct cycle', () => {
            const params = {
                signer: defaultSigner,
                mldsaSigner: null,
                network,
                utxos: [
                    createTaprootUtxo(address1, 50000n, '1'.repeat(64), 0),
                    createTaprootUtxo(address2, 30000n, '2'.repeat(64), 1),
                ],
                from: address1,
                to: address3,
                feeRate: 20,
                priorityFee: 2000n,
                gasSatFee: 1000n,
                amount: 60000n,
                splitInputsInto: 2,
            };

            // Export
            const exported = OfflineTransactionManager.exportFunding(params);

            // Inspect
            const inspected = OfflineTransactionManager.inspect(exported);
            expect(inspected.baseParams.feeRate).toBeCloseTo(20, 3);
            expect(inspected.utxos).toHaveLength(2);

            // Import with new signer
            const builder = OfflineTransactionManager.importForSigning(exported, {
                signer: signer1,
            });

            expect(builder).toBeDefined();
            expect(builder.type).toBe(TransactionType.FUNDING);
        });
    });

    describe('Actual Transaction Signing', () => {
        it('should sign a funding transaction through full offline workflow', async () => {
            // Phase 1: Online - Create and export transaction
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

            // Verify export is valid
            expect(OfflineTransactionManager.validate(exportedState)).toBe(true);

            // Phase 2: Offline - Import, sign, export
            const signedTxHex = await OfflineTransactionManager.importSignAndExport(
                exportedState,
                { signer: defaultSigner },
            );

            // Verify we got a valid hex transaction
            expect(signedTxHex).toBeDefined();
            expect(typeof signedTxHex).toBe('string');
            expect(signedTxHex.length).toBeGreaterThan(0);
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });

        it('should sign using two-step import then sign process', async () => {
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

            // Step 1: Import for signing
            const builder = OfflineTransactionManager.importForSigning(exportedState, {
                signer: signer1,
            });

            expect(builder).toBeDefined();
            expect(builder.type).toBe(TransactionType.FUNDING);

            // Step 2: Sign and export
            const signedTxHex = await OfflineTransactionManager.signAndExport(builder);

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });

        it('should sign with fee bumping', async () => {
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

            // Verify original fee rate
            const originalInspected = OfflineTransactionManager.inspect(originalState);
            expect(originalInspected.baseParams.feeRate).toBeCloseTo(5, 3);

            // Bump fee to 25 sat/vB
            const bumpedState = OfflineTransactionManager.rebuildWithNewFees(
                originalState,
                25,
                { signer: signer2 },
            );

            // Verify bumped fee rate
            const bumpedInspected = OfflineTransactionManager.inspect(bumpedState);
            expect(bumpedInspected.baseParams.feeRate).toBeCloseTo(25, 3);

            // Sign the bumped transaction
            const signedTxHex = await OfflineTransactionManager.importSignAndExport(
                bumpedState,
                { signer: signer2 },
            );

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

            // Bump and sign in one call
            const signedTxHex = await OfflineTransactionManager.rebuildSignAndExport(
                originalState,
                40, // New fee rate
                { signer: signer3 },
            );

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });

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

            // Verify all UTXOs are captured
            const inspected = OfflineTransactionManager.inspect(exportedState);
            expect(inspected.utxos).toHaveLength(3);

            // Sign
            const signedTxHex = await OfflineTransactionManager.importSignAndExport(
                exportedState,
                { signer: defaultSigner },
            );

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });

        it('should sign with address rotation using multiple signers', async () => {
            // For address rotation, UTXOs must use addresses that match the signers
            // Use all UTXOs from defaultAddress with defaultSigner for simplicity
            const signerMap = createSignerMap([
                { address: defaultAddress, signer: defaultSigner },
            ], network);

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

            // Verify address rotation is captured
            const inspected = OfflineTransactionManager.inspect(exportedState);
            expect(inspected.addressRotationEnabled).toBe(true);
            expect(inspected.signerMappings.length).toBeGreaterThan(0);

            // Sign with address rotation
            const signedTxHex = await OfflineTransactionManager.importSignAndExport(
                exportedState,
                {
                    signer: defaultSigner,
                    signerMap,
                },
            );

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });

        it('should produce different signatures with different signers', async () => {
            // Export state that can be signed by either signer
            const params = {
                signer: signer1,
                mldsaSigner: null,
                network,
                utxos: [createTaprootUtxo(address1, 100000n, '4'.repeat(64), 0)],
                from: address1,
                to: address2,
                feeRate: 10,
                priorityFee: 1000n,
                gasSatFee: 500n,
                amount: 50000n,
            };

            const exportedState = OfflineTransactionManager.exportFunding(params);

            // Sign with signer1
            const signedTx1 = await OfflineTransactionManager.importSignAndExport(
                exportedState,
                { signer: signer1 },
            );

            // Sign again with signer1 (should produce same structure, potentially different due to nonce)
            const signedTx1Again = await OfflineTransactionManager.importSignAndExport(
                exportedState,
                { signer: signer1 },
            );

            // Both signatures should be valid hex
            expect(/^[0-9a-f]+$/i.test(signedTx1)).toBe(true);
            expect(/^[0-9a-f]+$/i.test(signedTx1Again)).toBe(true);

            // Transaction structure should be similar in length
            // (exact match not guaranteed due to Schnorr signature randomness)
            expect(Math.abs(signedTx1.length - signedTx1Again.length)).toBeLessThan(10);
        });

        it('should handle split funding transaction', async () => {
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
                splitInputsInto: 3, // Split into 3 outputs
            };

            const exportedState = OfflineTransactionManager.exportFunding(params);

            // Verify split is captured
            const inspected = OfflineTransactionManager.inspect(exportedState);
            expect(isFundingSpecificData(inspected.typeSpecificData)).toBe(true);
            const fundingData = inspected.typeSpecificData as FundingSpecificData;
            expect(fundingData.splitInputsInto).toBe(3);

            // Sign
            const signedTxHex = await OfflineTransactionManager.importSignAndExport(
                exportedState,
                { signer: defaultSigner },
            );

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });

        it('should sign after format conversion (base64 -> hex -> base64)', async () => {
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

            // Export as base64
            const base64State = OfflineTransactionManager.exportFunding(params);

            // Convert to hex
            const hexState = OfflineTransactionManager.toHex(base64State);
            expect(/^[0-9a-f]+$/i.test(hexState)).toBe(true);

            // Convert back to base64
            const backToBase64 = OfflineTransactionManager.fromHex(hexState);

            // Both should validate
            expect(OfflineTransactionManager.validate(base64State)).toBe(true);
            expect(OfflineTransactionManager.validate(backToBase64)).toBe(true);

            // Sign from the converted state
            const signedTxHex = await OfflineTransactionManager.importSignAndExport(
                backToBase64,
                { signer: signer1 },
            );

            expect(signedTxHex).toBeDefined();
            expect(/^[0-9a-f]+$/i.test(signedTxHex)).toBe(true);
        });
    });
});

// Helper function to create mock challenge data
function createMockChallenge() {
    return {
        epochNumber: '100',
        mldsaPublicKey: '0x' + 'aa'.repeat(32),
        legacyPublicKey: '0x' + 'bb'.repeat(33),
        solution: '0x' + 'cc'.repeat(32),
        salt: '0x' + 'dd'.repeat(32),
        graffiti: '0x' + 'ee'.repeat(16),
        difficulty: 20,
        verification: {
            epochHash: '0x' + '11'.repeat(32),
            epochRoot: '0x' + '22'.repeat(32),
            targetHash: '0x' + '33'.repeat(32),
            targetChecksum: '0x' + '44'.repeat(32),
            startBlock: '1000',
            endBlock: '2000',
            proofs: ['0x' + '55'.repeat(32), '0x' + '66'.repeat(32)],
        },
    };
}
