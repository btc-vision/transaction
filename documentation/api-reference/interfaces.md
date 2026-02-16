# Interfaces Reference

Comprehensive reference for all key TypeScript interfaces in the `@btc-vision/transaction` library.

---

## Navigation

- [Back to API Reference](../README.md#api-reference-1)
- [Transaction Types](./transaction-types.md)
- [Response Types](./response-types.md)

---

## Table of Contents

- [UTXO](#utxo)
- [FetchUTXOParams](#fetchutxoparams)
- [FetchUTXOParamsMultiAddress](#fetchutxoparamsmultiaddress)
- [BroadcastResponse](#broadcastresponse)
- [ITweakedTransactionData](#itweakedtransactiondata)
- [ITransactionParameters](#itransactionparameters)
- [IFundingTransactionParameters](#ifundingtransactionparameters)
- [SharedInteractionParameters](#sharedinteractionparameters)
- [IInteractionParameters](#iinteractionparameters)
- [IDeploymentParameters](#ideploymentparameters)
- [IConsolidatedInteractionParameters](#iconsolidatedinteractionparameters)
- [IChallengeSolution](#ichallengesolution)
- [IChallengeVerification](#ichallengeverification)
- [RawChallenge](#rawchallenge)
- [IP2WSHAddress](#ip2wshaddress)
- [IHashCommittedP2WSH](#ihashcommittedp2wsh)
- [TweakSettings](#tweaksettings)
- [SignedMessage](#signedmessage)
- [MLDSASignedMessage](#mldsasignedmessage)
- [SchnorrSignature](#schnorrsignature)
- [ISerializableTransactionState](#iserializabletransactionstate)
- [PrecomputedData](#precomputeddata)
- [ReconstructionOptions](#reconstructionoptions)
- [LoadedStorage](#loadedstorage)
- [MLDSARequestData](#mldsarequestdata)
- [Type Aliases](#type-aliases)

---

## UTXO

Represents an unspent transaction output used as an input to a new transaction.

**Source:** `src/utxo/interfaces/IUTXO.ts`

```typescript
interface UTXO {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly value: bigint;
    readonly scriptPubKey: ScriptPubKey;
    redeemScript?: string | Uint8Array;
    witnessScript?: string | Uint8Array;
    nonWitnessUtxo?: string | Uint8Array;
    signer?: RotationSignerBase;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `transactionId` | `string` | Yes | The transaction ID (txid) containing this output, 64-character hex |
| `outputIndex` | `number` | Yes | The vout index within the parent transaction |
| `value` | `bigint` | Yes | Amount in satoshis |
| `scriptPubKey` | `ScriptPubKey` | Yes | Script public key with `hex` and optional `address` fields |
| `redeemScript` | `string \| Uint8Array` | No | P2SH redeem script (hex string or raw bytes) |
| `witnessScript` | `string \| Uint8Array` | No | P2WSH witness script (hex string or raw bytes) |
| `nonWitnessUtxo` | `string \| Uint8Array` | No | Full previous transaction (required for legacy/P2PKH inputs) |
| `signer` | `RotationSignerBase` | No | Per-UTXO signer for address rotation mode |

### Example

```typescript
const utxo: UTXO = {
    transactionId: 'abcd1234...ef',
    outputIndex: 0,
    value: 100_000n,
    scriptPubKey: {
        hex: '5120...',
        address: 'bc1p...',
    },
};
```

---

## FetchUTXOParams

Parameters for fetching UTXOs for a single address from the OPNet provider.

**Source:** `src/utxo/interfaces/IUTXO.ts`

```typescript
interface FetchUTXOParams {
    readonly address: string;
    readonly minAmount: bigint;
    readonly requestedAmount: bigint;
    optimized?: boolean | undefined;
    usePendingUTXO?: boolean | undefined;
}
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `address` | `string` | Yes | -- | Bitcoin address to fetch UTXOs for |
| `minAmount` | `bigint` | Yes | -- | Minimum UTXO value to include (dust filter) |
| `requestedAmount` | `bigint` | Yes | -- | Total amount needed (provider may optimize selection) |
| `optimized` | `boolean` | No | `true` | Enable UTXO selection optimization |
| `usePendingUTXO` | `boolean` | No | `true` | Include unconfirmed (mempool) UTXOs |

---

## FetchUTXOParamsMultiAddress

Parameters for fetching UTXOs across multiple addresses.

**Source:** `src/utxo/interfaces/IUTXO.ts`

```typescript
interface FetchUTXOParamsMultiAddress {
    readonly addresses: string[];
    readonly minAmount: bigint;
    readonly requestedAmount: bigint;
    readonly optimized?: boolean;
    readonly usePendingUTXO?: boolean;
}
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `addresses` | `string[]` | Yes | -- | Array of Bitcoin addresses to fetch UTXOs from |
| `minAmount` | `bigint` | Yes | -- | Minimum UTXO value to include |
| `requestedAmount` | `bigint` | Yes | -- | Total amount needed |
| `optimized` | `boolean` | No | `true` | Enable UTXO selection optimization |
| `usePendingUTXO` | `boolean` | No | `true` | Include unconfirmed UTXOs |

---

## BroadcastResponse

Response from broadcasting a signed transaction to the network.

**Source:** `src/utxo/interfaces/BroadcastResponse.ts`

```typescript
interface BroadcastResponse {
    success: boolean;
    result?: string;
    error?: string;
    peers?: number;
    identifier: bigint;
    modifiedTransaction?: string;
    created?: boolean;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `success` | `boolean` | Yes | Whether the broadcast was accepted |
| `result` | `string` | No | Transaction ID if successful |
| `error` | `string` | No | Error message if broadcast failed |
| `peers` | `number` | No | Number of peers the transaction was relayed to |
| `identifier` | `bigint` | Yes | Unique identifier for the broadcast request |
| `modifiedTransaction` | `string` | No | Modified transaction hex (if the node altered it) |
| `created` | `boolean` | No | Whether a new transaction was created on the network |

---

## ITweakedTransactionData

Base configuration shared by all transaction types, providing signer, network, and signing options.

**Source:** `src/transaction/interfaces/ITweakedTransactionData.ts`

```typescript
interface ITweakedTransactionData {
    readonly mldsaSigner: QuantumBIP32Interface | null;
    readonly signer: Signer | UniversalSigner;
    readonly network: Network;
    readonly chainId?: ChainId;
    readonly nonWitnessUtxo?: Uint8Array;
    readonly noSignatures?: boolean;
    readonly unlockScript?: Uint8Array[];
    readonly txVersion?: SupportedTransactionVersion;
    readonly addressRotation?: AddressRotationConfigBase;
    readonly parallelSigning?: SigningPoolLike | WorkerPoolConfig;
    readonly useP2MR?: boolean;
}
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `mldsaSigner` | `QuantumBIP32Interface \| null` | Yes | -- | ML-DSA quantum signer (pass `null` if not using quantum) |
| `signer` | `Signer \| UniversalSigner` | Yes | -- | Classical secp256k1 signer |
| `network` | `Network` | Yes | -- | Bitcoin network configuration |
| `chainId` | `ChainId` | No | -- | Chain identifier for cross-chain use |
| `nonWitnessUtxo` | `Uint8Array` | No | -- | Full previous transaction for legacy inputs |
| `noSignatures` | `boolean` | No | `false` | Build transaction without signing (for fee estimation) |
| `unlockScript` | `Uint8Array[]` | No | -- | Custom unlock script stack items |
| `txVersion` | `SupportedTransactionVersion` | No | `2` | Bitcoin transaction version (1, 2, or 3) |
| `addressRotation` | `AddressRotationConfigBase` | No | -- | Per-UTXO signing configuration |
| `parallelSigning` | `SigningPoolLike \| WorkerPoolConfig` | No | -- | Worker pool for parallel input signing |
| `useP2MR` | `boolean` | No | `false` | When `true`, use P2MR (Pay-to-Merkle-Root, BIP 360) instead of P2TR. P2MR commits to a Merkle root without a key-path spend, eliminating quantum-vulnerable internal pubkey exposure. Outputs use `OP_2 <32-byte merkle_root>` and addresses start with `bc1z`. |

---

## ITransactionParameters

Core parameters for all transaction types. Extends `ITweakedTransactionData`.

**Source:** `src/transaction/interfaces/ITransactionParameters.ts`

```typescript
interface ITransactionParameters extends ITweakedTransactionData {
    readonly from?: string;
    readonly to?: string;
    readonly debugFees?: boolean;
    readonly revealMLDSAPublicKey?: boolean;
    readonly linkMLDSAPublicKeyToAddress?: boolean;
    utxos: UTXO[];
    nonWitnessUtxo?: Uint8Array;
    estimatedFees?: bigint;
    optionalInputs?: UTXO[];
    optionalOutputs?: PsbtOutputExtended[];
    chainId?: ChainId;
    noSignatures?: boolean;
    readonly note?: string | Uint8Array;
    readonly anchor?: boolean;
    readonly feeRate: number;
    readonly priorityFee: bigint;
    readonly gasSatFee: bigint;
    readonly compiledTargetScript?: Uint8Array | string;
    readonly addressRotation?: AddressRotationConfigBase;
}
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `from` | `string` | No | Derived from signer | Sender address (used for change output) |
| `to` | `string` | No | -- | Recipient / contract address |
| `debugFees` | `boolean` | No | `false` | Log detailed fee calculation info |
| `revealMLDSAPublicKey` | `boolean` | No | `false` | Include ML-DSA public key in features |
| `linkMLDSAPublicKeyToAddress` | `boolean` | No | `false` | Link ML-DSA key to legacy address on-chain |
| `utxos` | `UTXO[]` | Yes | -- | UTXOs to spend as inputs |
| `estimatedFees` | `bigint` | No | -- | Pre-calculated fee estimate (skip estimation) |
| `optionalInputs` | `UTXO[]` | No | `[]` | Additional inputs (e.g., fee UTXOs) |
| `optionalOutputs` | `PsbtOutputExtended[]` | No | -- | Additional outputs (e.g., OP_RETURN) |
| `note` | `string \| Uint8Array` | No | -- | OP_RETURN note data |
| `anchor` | `boolean` | No | `false` | Add an anchor output (P2A) for CPFP |
| `feeRate` | `number` | Yes | -- | Fee rate in sat/vB |
| `priorityFee` | `bigint` | Yes | -- | OPNet priority fee in satoshis |
| `gasSatFee` | `bigint` | Yes | -- | OPNet gas fee in satoshis |
| `compiledTargetScript` | `Uint8Array \| string` | No | -- | Pre-compiled target script (skip recompilation) |

---

## IFundingTransactionParameters

Parameters for funding/BTC transfer transactions. Extends `ITransactionParameters`.

**Source:** `src/transaction/interfaces/ITransactionParameters.ts`

```typescript
interface IFundingTransactionParameters extends ITransactionParameters {
    amount: bigint;
    splitInputsInto?: number;
    autoAdjustAmount?: boolean;
    feeUtxos?: UTXO[];
}
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `amount` | `bigint` | Yes | -- | Amount to send in satoshis |
| `splitInputsInto` | `number` | No | `1` | Split the output into N equal UTXOs |
| `autoAdjustAmount` | `boolean` | No | `false` | Deduct fees from the output amount (send-max mode) |
| `feeUtxos` | `UTXO[]` | No | -- | Separate UTXOs used exclusively for fees |

---

## SharedInteractionParameters

Shared parameters for interaction-like transactions (interactions, cancellations).

**Source:** `src/transaction/interfaces/ITransactionParameters.ts`

```typescript
interface SharedInteractionParameters extends ITransactionParameters {
    calldata?: Uint8Array;
    disableAutoRefund?: boolean;
    readonly challenge: IChallengeSolution;
    readonly randomBytes?: Uint8Array;
    readonly loadedStorage?: LoadedStorage;
    readonly isCancellation?: boolean;
}
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `calldata` | `Uint8Array` | No | -- | ABI-encoded function call data |
| `disableAutoRefund` | `boolean` | No | `false` | Skip automatic change/refund output |
| `challenge` | `IChallengeSolution` | Yes | -- | Epoch challenge solution |
| `randomBytes` | `Uint8Array` | No | Random | 32 random bytes for script uniqueness |
| `loadedStorage` | `LoadedStorage` | No | -- | Pre-loaded contract storage (access list) |
| `isCancellation` | `boolean` | No | `false` | Mark as a cancellation interaction |

---

## IInteractionParameters

Parameters for contract interaction transactions. Extends `SharedInteractionParameters`.

**Source:** `src/transaction/interfaces/ITransactionParameters.ts`

```typescript
interface IInteractionParameters extends SharedInteractionParameters {
    readonly calldata: Uint8Array;
    readonly to: string;
    readonly contract?: string;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `calldata` | `Uint8Array` | Yes | ABI-encoded function call data |
| `to` | `string` | Yes | Contract address (P2TR Taproot address) |
| `contract` | `string` | No | Contract secret (32-byte hex string) |

---

## IDeploymentParameters

Parameters for contract deployment transactions.

**Source:** `src/transaction/interfaces/ITransactionParameters.ts`

```typescript
interface IDeploymentParameters extends Omit<ITransactionParameters, 'to'> {
    readonly bytecode: Uint8Array;
    readonly calldata?: Uint8Array;
    readonly randomBytes?: Uint8Array;
    readonly challenge: IChallengeSolution;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `bytecode` | `Uint8Array` | Yes | Compiled contract bytecode |
| `calldata` | `Uint8Array` | No | Constructor calldata |
| `randomBytes` | `Uint8Array` | No | 32 random bytes for deterministic address generation |
| `challenge` | `IChallengeSolution` | Yes | Epoch challenge solution |

---

## IConsolidatedInteractionParameters

Parameters for consolidated (two-phase) interaction transactions. Extends `IInteractionParameters`.

**Source:** `src/transaction/interfaces/IConsolidatedTransactionParameters.ts`

```typescript
interface IConsolidatedInteractionParameters extends IInteractionParameters {
    readonly maxChunkSize?: number;
}
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `maxChunkSize` | `number` | No | `80` | Maximum bytes per P2WSH stack item (policy limit) |

All other properties are inherited from `IInteractionParameters`.

---

## IChallengeSolution

Represents a solved epoch challenge required for deployment and interaction transactions.

**Source:** `src/epoch/interfaces/IChallengeSolution.ts`

```typescript
interface IChallengeSolution {
    readonly epochNumber: bigint;
    readonly publicKey: Address;
    readonly solution: Uint8Array;
    readonly salt: Uint8Array;
    readonly graffiti: Uint8Array;
    readonly difficulty: number;
    readonly verification: IChallengeVerification;

    verifySubmissionSignature(): boolean;
    getSubmission(): IChallengeSubmission | undefined;
    toRaw(): RawChallenge;
    verify(): boolean;
    toBuffer(): Uint8Array;
    toHex(): string;
    calculateSolution(): Uint8Array;
    checkDifficulty(minDifficulty: number): { valid: boolean; difficulty: number };
    getMiningTargetBlock(): bigint | null;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `epochNumber` | `bigint` | The epoch number this challenge belongs to |
| `publicKey` | `Address` | The miner's public key (Address instance) |
| `solution` | `Uint8Array` | The computed solution bytes |
| `salt` | `Uint8Array` | Random salt used in the challenge computation |
| `graffiti` | `Uint8Array` | Optional graffiti data embedded in the solution |
| `difficulty` | `number` | The difficulty level of this solution |
| `verification` | `IChallengeVerification` | Verification data (epoch hash, root, proofs) |

| Method | Returns | Description |
|--------|---------|-------------|
| `verifySubmissionSignature()` | `boolean` | Verify the submission signature is valid |
| `getSubmission()` | `IChallengeSubmission \| undefined` | Get the challenge submission data |
| `toRaw()` | `RawChallenge` | Convert to JSON-serializable format |
| `verify()` | `boolean` | Verify the entire challenge solution |
| `toBuffer()` | `Uint8Array` | Serialize to binary |
| `toHex()` | `string` | Serialize to hex string |
| `calculateSolution()` | `Uint8Array` | Recalculate the solution |
| `checkDifficulty(min)` | `{ valid, difficulty }` | Check if difficulty meets minimum |
| `getMiningTargetBlock()` | `bigint \| null` | Get the target block for mining |

---

## IChallengeVerification

Verification data for an epoch challenge.

**Source:** `src/epoch/interfaces/IChallengeSolution.ts`

```typescript
interface IChallengeVerification {
    readonly epochHash: Uint8Array;
    readonly epochRoot: Uint8Array;
    readonly targetHash: Uint8Array;
    readonly targetChecksum: Uint8Array;
    readonly startBlock: bigint;
    readonly endBlock: bigint;
    readonly proofs: readonly Uint8Array[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `epochHash` | `Uint8Array` | Hash of the current epoch |
| `epochRoot` | `Uint8Array` | Merkle root of the epoch |
| `targetHash` | `Uint8Array` | Target hash for mining |
| `targetChecksum` | `Uint8Array` | Checksum of the target |
| `startBlock` | `bigint` | First block of the epoch |
| `endBlock` | `bigint` | Last block of the epoch |
| `proofs` | `readonly Uint8Array[]` | Merkle proofs for verification |

---

## RawChallenge

JSON-serializable representation of a challenge solution.

**Source:** `src/epoch/interfaces/IChallengeSolution.ts`

```typescript
interface RawChallenge {
    readonly epochNumber: string;
    readonly mldsaPublicKey: string;
    readonly legacyPublicKey: string;
    readonly solution: string;
    readonly salt: string;
    readonly graffiti: string;
    readonly difficulty: number;
    readonly verification: RawChallengeVerification;
    readonly submission?: RawChallengeSubmission;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `epochNumber` | `string` | Yes | Epoch number as decimal string |
| `mldsaPublicKey` | `string` | Yes | ML-DSA public key as hex |
| `legacyPublicKey` | `string` | Yes | Legacy secp256k1 public key as hex |
| `solution` | `string` | Yes | Solution bytes as hex |
| `salt` | `string` | Yes | Salt bytes as hex |
| `graffiti` | `string` | Yes | Graffiti bytes as hex |
| `difficulty` | `number` | Yes | Solution difficulty |
| `verification` | `RawChallengeVerification` | Yes | Verification data (hex-encoded) |
| `submission` | `RawChallengeSubmission` | No | Submission data if submitted |

---

## IP2WSHAddress

Represents a Pay-to-Witness-Script-Hash address with its witness script.

**Source:** `src/transaction/mineable/IP2WSHAddress.ts`

```typescript
interface IP2WSHAddress {
    address: string;
    witnessScript: Uint8Array;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `address` | `string` | The P2WSH bech32 address |
| `witnessScript` | `Uint8Array` | The witness script that hashes to the address |

---

## IHashCommittedP2WSH

Extended P2WSH address with hash commitments used by the CHCT (Consolidated Hash Commitment Transaction) system.

**Source:** `src/transaction/interfaces/IConsolidatedTransactionParameters.ts`

```typescript
interface IHashCommittedP2WSH extends IP2WSHAddress {
    readonly dataHashes: Uint8Array[];
    readonly dataChunks: Uint8Array[];
    readonly chunkStartIndex: number;
    readonly scriptPubKey: Uint8Array;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `address` | `string` | The P2WSH bech32 address (inherited) |
| `witnessScript` | `Uint8Array` | The witness script with HASH160 commitments (inherited) |
| `dataHashes` | `Uint8Array[]` | HASH160 values of all committed data chunks |
| `dataChunks` | `Uint8Array[]` | The actual data chunks (for reveal) |
| `chunkStartIndex` | `number` | Starting index of this output's chunks in the sequence |
| `scriptPubKey` | `Uint8Array` | The P2WSH scriptPubKey (`OP_0 <32-byte-hash>`) |

---

## TweakSettings

Configuration for Taproot key tweaking.

**Source:** `src/signer/TweakedSigner.ts`

```typescript
interface TweakSettings {
    readonly network?: Network;
    tweakHash?: Bytes32;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `network` | `Network` | No | The network to use for key derivation |
| `tweakHash` | `Bytes32` | No | Custom tweak hash (defaults to standard Taproot tweak) |

---

## SignedMessage

Result of signing a message with a Schnorr key pair.

**Source:** `src/keypair/MessageSigner.ts`

```typescript
interface SignedMessage {
    readonly signature: Uint8Array;
    readonly message: Uint8Array;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `signature` | `Uint8Array` | 64-byte Schnorr signature |
| `message` | `Uint8Array` | The SHA-256 hash of the original message |

---

## MLDSASignedMessage

Result of signing a message with an ML-DSA quantum key pair.

**Source:** `src/keypair/MessageSigner.ts`

```typescript
interface MLDSASignedMessage {
    readonly signature: Uint8Array;
    readonly message: Uint8Array;
    readonly publicKey: Uint8Array;
    readonly securityLevel: MLDSASecurityLevel;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `signature` | `Uint8Array` | ML-DSA signature (size depends on security level) |
| `message` | `Uint8Array` | The SHA-256 hash of the original message |
| `publicKey` | `Uint8Array` | The ML-DSA public key used for signing |
| `securityLevel` | `MLDSASecurityLevel` | The security level (LEVEL2, LEVEL3, or LEVEL5) |

---

## SchnorrSignature

A Schnorr signature paired with the signer's Address.

**Source:** `src/buffer/BinaryReader.ts`

```typescript
interface SchnorrSignature {
    readonly address: Address;
    readonly signature: Uint8Array;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `address` | `Address` | The signer's Address (contains both ML-DSA and tweaked public keys) |
| `signature` | `Uint8Array` | 64-byte Schnorr signature |

---

## ISerializableTransactionState

Complete serializable state for offline transaction signing workflows.

**Source:** `src/transaction/offline/interfaces/ISerializableState.ts`

```typescript
interface ISerializableTransactionState {
    readonly header: SerializationHeader;
    readonly baseParams: SerializedBaseParams;
    readonly utxos: SerializedUTXO[];
    readonly optionalInputs: SerializedUTXO[];
    readonly optionalOutputs: SerializedOutput[];
    readonly addressRotationEnabled: boolean;
    readonly signerMappings: SerializedSignerMapping[];
    readonly typeSpecificData: TypeSpecificData;
    readonly precomputedData: PrecomputedData;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `header` | `SerializationHeader` | Version, chain, timestamp, and transaction type |
| `baseParams` | `SerializedBaseParams` | Sender, recipient, fees, network name |
| `utxos` | `SerializedUTXO[]` | Primary UTXOs (JSON-serializable format) |
| `optionalInputs` | `SerializedUTXO[]` | Additional inputs |
| `optionalOutputs` | `SerializedOutput[]` | Additional outputs |
| `addressRotationEnabled` | `boolean` | Whether address rotation mode is active |
| `signerMappings` | `SerializedSignerMapping[]` | Address-to-input-index mappings for rotation |
| `typeSpecificData` | `TypeSpecificData` | Transaction-type-specific data (discriminated union) |
| `precomputedData` | `PrecomputedData` | Cached computation results for deterministic rebuild |

---

## PrecomputedData

Pre-computed data preserved for deterministic transaction rebuilds.

**Source:** `src/transaction/offline/interfaces/ISerializableState.ts`

```typescript
interface PrecomputedData {
    readonly compiledTargetScript?: string;
    readonly randomBytes?: string;
    readonly estimatedFees?: string;
    readonly contractSeed?: string;
    readonly contractAddress?: string;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `compiledTargetScript` | `string` | Hex-encoded compiled target script |
| `randomBytes` | `string` | Hex-encoded random bytes (must be preserved for determinism) |
| `estimatedFees` | `string` | Estimated fees as decimal string (bigint) |
| `contractSeed` | `string` | Hex-encoded contract seed for deployment |
| `contractAddress` | `string` | Derived contract address |

---

## ReconstructionOptions

Options for reconstructing a transaction from serialized state (offline signing Phase 2).

Imported from `src/transaction/offline/TransactionReconstructor.ts`.

```typescript
interface ReconstructionOptions {
    signer: Signer | UniversalSigner;
    newFeeRate?: number;
    newPriorityFee?: bigint;
    newGasSatFee?: bigint;
    signerMap?: SignerMap;
    mldsaSigner?: QuantumBIP32Interface | null;
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `signer` | `Signer \| UniversalSigner` | Yes | The signer to use for signing the reconstructed transaction |
| `newFeeRate` | `number` | No | Override fee rate for fee bumping (RBF) |
| `newPriorityFee` | `bigint` | No | Override priority fee |
| `newGasSatFee` | `bigint` | No | Override gas sat fee |
| `signerMap` | `SignerMap` | No | Address-to-signer mapping for rotation mode |
| `mldsaSigner` | `QuantumBIP32Interface \| null` | No | ML-DSA quantum signer |

---

## LoadedStorage

Pre-loaded contract storage slots for the access list feature.

**Source:** `src/transaction/interfaces/ITransactionParameters.ts`

```typescript
interface LoadedStorage {
    [key: string]: string[];
}
```

The keys are contract addresses and the values are arrays of storage slot identifiers (hex strings).

```typescript
const loadedStorage: LoadedStorage = {
    'bc1p...contractAddress': [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
    ],
};
```

---

## MLDSARequestData

Data structure for linking an ML-DSA public key to a legacy address.

**Source:** `src/generators/MLDSAData.ts`

```typescript
interface MLDSARequestData {
    readonly verifyRequest: boolean;
    readonly publicKey: Uint8Array | null;
    readonly hashedPublicKey: Uint8Array;
    readonly level: MLDSASecurityLevel;
    readonly mldsaSignature: Uint8Array | null;
    readonly legacySignature: Uint8Array;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `verifyRequest` | `boolean` | Whether to include full verification data |
| `publicKey` | `Uint8Array \| null` | Full ML-DSA public key (included when revealing) |
| `hashedPublicKey` | `Uint8Array` | HASH160 of the ML-DSA public key |
| `level` | `MLDSASecurityLevel` | Security level (currently only LEVEL2 supported) |
| `mldsaSignature` | `Uint8Array \| null` | ML-DSA signature proving key ownership |
| `legacySignature` | `Uint8Array` | Schnorr signature linking legacy key to ML-DSA key |

---

## Type Aliases

Commonly used type aliases defined in `src/utils/types.ts`:

```typescript
type MemorySlotPointer = bigint;
type BufferLike = Uint8Array;
type MemorySlotData<T> = T;
type PointerStorage = DeterministicMap<MemorySlotPointer, MemorySlotData<bigint>>;
type BlockchainStorage = DeterministicMap<string, PointerStorage>;

// Numeric aliases
type i8 = number;
type i16 = number;
type i32 = number;
type i64 = bigint;
type u8 = number;
type u16 = number;
type u32 = number;
type u64 = bigint;
type Selector = number;
```

**Key external types used throughout the library:**

| Type | Package | Description |
|------|---------|-------------|
| `UniversalSigner` | `@btc-vision/ecpair` | secp256k1 key pair with sign/verify methods |
| `QuantumBIP32Interface` | `@btc-vision/bip32` | ML-DSA quantum key pair interface |
| `Signer` | `@btc-vision/bitcoin` | Base signer interface (publicKey + sign) |
| `Network` | `@btc-vision/bitcoin` | Bitcoin network parameters |
| `PsbtOutputExtended` | `@btc-vision/bitcoin` | PSBT output with address or script |
| `PsbtInputExtended` | `@btc-vision/bitcoin` | PSBT input with witness/redeem data |
| `Script` | `@btc-vision/bitcoin` | Bitcoin script type |

---

## See Also

- [Transaction Types](./transaction-types.md) -- All enum types
- [Response Types](./response-types.md) -- Return types from factory methods
- [TransactionFactory](../transaction-building/transaction-factory.md) -- Main entry point using these interfaces
