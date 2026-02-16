# Script Generators

Bitcoin script generators for OPNet transaction types.

## Overview

OPNet embeds smart contract data (bytecode, calldata, challenges, features) inside Bitcoin Taproot scripts. The generator classes compile this data into valid Bitcoin scripts that the OPNet network can parse and execute. Each generator corresponds to a specific transaction type: deployments, interactions, custom scripts, multi-signature, P2WDA witness data, and hash commitments.

All generators except `MultiSignGenerator`, `HashCommitmentGenerator`, and `AddressGenerator` extend the abstract `Generator` base class, which provides common functionality for header construction, chunk splitting, and feature encoding.

**Sources:**
- `src/generators/Generator.ts` -- Abstract base class
- `src/generators/AddressGenerator.ts` -- Address generation
- `src/generators/Features.ts` -- Feature flags and types
- `src/generators/MLDSAData.ts` -- ML-DSA key linking data
- `src/generators/builders/DeploymentGenerator.ts`
- `src/generators/builders/CalldataGenerator.ts`
- `src/generators/builders/CustomGenerator.ts`
- `src/generators/builders/MultiSignGenerator.ts`
- `src/generators/builders/P2WDAGenerator.ts`
- `src/generators/builders/HashCommitmentGenerator.ts`

## Table of Contents

- [Generator Base Class](#generator-base-class)
  - [Constants](#constants)
  - [Constructor](#base-constructor)
  - [Methods](#base-methods)
- [Features Enum](#features-enum)
- [DeploymentGenerator](#deploymentgenerator)
- [CalldataGenerator](#calldatagenerator)
- [CustomGenerator](#customgenerator)
- [MultiSignGenerator](#multisigngenerator)
- [P2WDAGenerator](#p2wdagenerator)
- [HashCommitmentGenerator](#hashcommitmentgenerator)
- [AddressGenerator](#addressgenerator)
- [MLDSAData](#mldsadata)
- [Script Structure](#script-structure)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Generator Base Class

The abstract `Generator` class provides shared functionality for all script generators.

**Source:** `src/generators/Generator.ts`

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DATA_CHUNK_SIZE` | `512` | Maximum bytes per data chunk in a Taproot script push. |
| `MAGIC` | `Uint8Array('op')` | Two-byte magic identifier marking OPNet scripts. |

### Base Constructor

```typescript
protected constructor(
    senderPubKey: PublicKey | XOnlyPublicKey,
    contractSaltPubKey?: Uint8Array,
    network: Network = networks.bitcoin,
)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `senderPubKey` | `PublicKey \| XOnlyPublicKey` | The sender's public key (33-byte compressed or 32-byte x-only). |
| `contractSaltPubKey` | `Uint8Array` | Optional contract salt public key for deployment and interaction scripts. |
| `network` | `Network` | The Bitcoin network (default: mainnet). |

### Base Methods

#### buildHeader

```typescript
public buildHeader(features: Features[]): Uint8Array
```

Builds a 4-byte header containing the first byte of the sender's public key and a 24-bit feature flags field.

| Parameter | Type | Description |
|-----------|------|-------------|
| `features` | `Features[]` | Array of feature flags to OR together into the header. |

**Returns:** `Uint8Array` -- 4-byte header `[pubkey[0], flags[2], flags[1], flags[0]]`.

#### getHeader

```typescript
public getHeader(maxPriority: bigint, features: Features[] = []): Uint8Array
```

Builds a 12-byte complete header: 4-byte feature header + 8-byte priority fee (u64).

| Parameter | Type | Description |
|-----------|------|-------------|
| `maxPriority` | `bigint` | Maximum priority fee in satoshis. |
| `features` | `Features[]` | Feature flags to include. |

**Returns:** `Uint8Array` -- 12-byte header.

#### compile

```typescript
public abstract compile(...args: unknown[]): Uint8Array
```

Compiles the generator's data into a Bitcoin script. Each subclass defines its own signature.

#### splitBufferIntoChunks

```typescript
protected splitBufferIntoChunks(
    buffer: Uint8Array,
    chunkSize: number = Generator.DATA_CHUNK_SIZE,
): Array<Uint8Array[]>
```

Splits a buffer into chunks of at most `chunkSize` bytes, suitable for Bitcoin script data pushes.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `buffer` | `Uint8Array` | -- | The data to split. |
| `chunkSize` | `number` | `512` | Maximum bytes per chunk. |

**Returns:** `Array<Uint8Array[]>` -- Array of single-element arrays (each containing one chunk).

---

## Features Enum

Bit flags that enable optional features in transaction scripts.

**Source:** `src/generators/Features.ts`

```typescript
enum Features {
    ACCESS_LIST     = 0b001,  // 1 - Include storage access list for gas optimization
    EPOCH_SUBMISSION = 0b010, // 2 - Include epoch challenge submission
    MLDSA_LINK_PUBKEY = 0b100, // 4 - Include ML-DSA public key linking request
}
```

| Feature | Bit | Description |
|---------|-----|-------------|
| `ACCESS_LIST` | `1` | Attaches a compressed storage access list (contract addresses + storage pointers). |
| `EPOCH_SUBMISSION` | `2` | Embeds a signed epoch challenge submission. |
| `MLDSA_LINK_PUBKEY` | `4` | Embeds an ML-DSA public key linking request with verification data. |

Features are encoded in the script header as a 24-bit bitmask and their data is appended in priority order.

### Feature Interfaces

```typescript
interface Feature<T extends Features> {
    opcode: T;
    data: unknown;
    priority: number;
}

interface AccessListFeature extends Feature<Features.ACCESS_LIST> {
    data: LoadedStorage;  // Contract address -> storage pointer map
}

interface EpochSubmissionFeature extends Feature<Features.EPOCH_SUBMISSION> {
    data: ChallengeSubmission;
}

interface MLDSALinkRequest extends Feature<Features.MLDSA_LINK_PUBKEY> {
    data: MLDSARequestData;
}
```

---

## DeploymentGenerator

Generates Bitcoin scripts for smart contract deployment transactions.

**Source:** `src/generators/builders/DeploymentGenerator.ts`

### Constructor

```typescript
new DeploymentGenerator(
    senderPubKey: PublicKey,
    contractSaltPubKey: Uint8Array,
    network?: Network,
)
```

### compile

```typescript
public compile(
    contractBytecode: Uint8Array,
    contractSalt: Uint8Array,
    challenge: IChallengeSolution,
    maxPriority: bigint,
    calldata?: Uint8Array,
    features?: Feature<Features>[],
): Uint8Array
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `contractBytecode` | `Uint8Array` | The compiled smart contract bytecode (typically compressed). |
| `contractSalt` | `Uint8Array` | The contract salt (determines the contract address). |
| `challenge` | `IChallengeSolution` | The epoch challenge solution for mining rewards. |
| `maxPriority` | `bigint` | Maximum priority fee in satoshis. |
| `calldata` | `Uint8Array` | Optional constructor calldata. |
| `features` | `Feature<Features>[]` | Optional feature data (access list, epoch submission, etc.). |

**Returns:** `Uint8Array` -- The compiled Bitcoin script.

The deployment script structure includes sender verification (`OP_CHECKSIGVERIFY`), contract salt verification, the OPNet magic marker, feature data, constructor calldata (separated by `OP_0`), and bytecode chunks (separated by `OP_1NEGATE`).

---

## CalldataGenerator

Generates Bitcoin scripts for smart contract interaction (function call) transactions.

**Source:** `src/generators/builders/CalldataGenerator.ts`

### Constructor

```typescript
new CalldataGenerator(
    senderPubKey: PublicKey,
    contractSaltPubKey: Uint8Array,
    network?: Network,
)
```

### compile

```typescript
public compile(
    calldata: Uint8Array,
    contractSecret: Uint8Array,
    challenge: IChallengeSolution,
    maxPriority: bigint,
    featuresRaw?: Feature<Features>[],
): Uint8Array
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `calldata` | `Uint8Array` | The encoded function call data (selector + arguments). |
| `contractSecret` | `Uint8Array` | The contract secret (used with `OP_HASH160` verification). |
| `challenge` | `IChallengeSolution` | The epoch challenge solution. |
| `maxPriority` | `bigint` | Maximum priority fee. |
| `featuresRaw` | `Feature<Features>[]` | Optional features. |

**Returns:** `Uint8Array` -- The compiled Bitcoin script.

### Static: getPubKeyAsBuffer

```typescript
static getPubKeyAsBuffer(witnessKeys: Uint8Array[], network: Network): Uint8Array
```

Concatenates and optionally compresses public keys for witness data. Returns whichever is smaller: the raw concatenation or the gzip-compressed version.

---

## CustomGenerator

Generates Bitcoin scripts from pre-assembled script data.

**Source:** `src/generators/builders/CustomGenerator.ts`

### Constructor

```typescript
new CustomGenerator(senderPubKey: XOnlyPublicKey, network?: Network)
```

### compile

```typescript
public compile(compiledData: (Uint8Array | Stack)[]): Uint8Array
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `compiledData` | `(Uint8Array \| Stack)[]` | Pre-assembled script opcodes and data. |

**Returns:** `Uint8Array` -- The compiled and validated Bitcoin script.

---

## MultiSignGenerator

Generates Bitcoin scripts for multi-signature transaction verification using `OP_CHECKSIGADD`.

**Source:** `src/generators/builders/MultiSignGenerator.ts`

> **Note:** This class does NOT extend `Generator`. It is a standalone static utility.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAXIMUM_SUPPORTED_SIGNATURE` | `255` | Maximum number of signers in a multi-sig script. |

### compile

```typescript
static compile(
    vaultPublicKeys: Uint8Array[] | PublicKey[],
    minimumSignatures: number,
    internal?: Uint8Array | XOnlyPublicKey,
): Uint8Array
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `vaultPublicKeys` | `Uint8Array[] \| PublicKey[]` | Array of signer public keys. Duplicates are removed and keys are sorted. |
| `minimumSignatures` | `number` | Minimum number of valid signatures required (must be >= 2). |
| `internal` | `Uint8Array \| XOnlyPublicKey` | Optional internal key to include in the script. |

**Returns:** `Uint8Array` -- Compiled multi-sig script.

**Throws:**
- `Error` if `minimumSignatures < 2`.
- `Error` if fewer public keys than required signatures.
- `Error` if `minimumSignatures > 255`.

The generated script uses the Tapscript `OP_CHECKSIGADD` pattern:
```
OP_0
<pubkey1> OP_CHECKSIGADD
<pubkey2> OP_CHECKSIGADD
...
<minimumRequired> OP_NUMEQUAL
```

---

## P2WDAGenerator

Generates binary operation data for Pay-to-Witness-Data-Authentication (P2WDA) transactions. Unlike other generators, P2WDA compiles to raw binary data (not Bitcoin script opcodes) that is embedded in the witness field.

**Source:** `src/generators/builders/P2WDAGenerator.ts`

> **Note:** This generator is not fully implemented yet.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `P2WDA_VERSION` | `0x01` | Version byte for P2WDA data format. |

### compile

```typescript
public compile(
    calldata: Uint8Array,
    contractSecret: Uint8Array,
    challenge: IChallengeSolution,
    maxPriority: bigint,
    featuresRaw?: Feature<Features>[],
): Uint8Array
```

**Returns:** `Uint8Array` -- Raw binary data with structure:
```
[version:1][header:12][contractSecret:32][challengePubKey:32][challengeSolution:20]
[calldataLength:4][calldata:N][featureCount:2][features:...]
```

### Static: validateWitnessSize

```typescript
static validateWitnessSize(
    dataSize: number,
    maxWitnessFields?: number,
    maxBytesPerWitness?: number,
): boolean
```

Validates whether operation data will fit within P2WSH witness limits.

---

## HashCommitmentGenerator

Generates hash-committed P2WSH addresses for the Consolidated Hash-Committed Transaction (CHCT) system. These scripts enforce that specific data must be provided in the witness to spend the output, ensuring data cannot be stripped or modified.

**Source:** `src/generators/builders/HashCommitmentGenerator.ts`

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_CHUNK_SIZE` | `80` | Maximum bytes per P2WSH stack item. |
| `MAX_STACK_ITEMS` | `100` | Maximum stack items per P2WSH input. |
| `MAX_WITNESS_SIZE` | `1650` | Maximum total witness size in bytes. |
| `MAX_CHUNKS_PER_OUTPUT` | `14` | Maximum data chunks per P2WSH output (calculated from limits). |
| `MAX_STANDARD_WEIGHT` | `400000` | Maximum weight per standard transaction. |
| `MIN_OUTPUT_VALUE` | `330n` | Minimum satoshis per output (dust limit). |
| `WEIGHT_PER_INPUT` | Calculated | Total weight per input with max chunks. |

### Constructor

```typescript
new HashCommitmentGenerator(publicKey: Uint8Array, network?: Network)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `publicKey` | `Uint8Array` | 33-byte compressed public key for the `OP_CHECKSIG` in the witness script. |
| `network` | `Network` | Bitcoin network (default: mainnet). |

### Key Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `hashChunk(data)` | `Uint8Array` | Computes HASH160 of a data chunk (20 bytes). |
| `generateWitnessScript(dataHashes)` | `Uint8Array` | Generates a witness script with hash commitments for the given HASH160 values. |
| `generateP2WSHAddress(witnessScript)` | `IP2WSHAddress & { scriptPubKey }` | Generates a P2WSH address from a witness script. |
| `prepareChunks(data, maxChunkSize?)` | `IHashCommittedP2WSH[]` | Splits data into chunks, generates hash commitments, and returns P2WSH output descriptors. |

### Static Estimation Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `calculateMaxInputsPerTx()` | `number` | Maximum P2WSH inputs per standard reveal transaction (~38). |
| `calculateMaxDataPerTx()` | `number` | Maximum data bytes per reveal transaction. |
| `estimateOutputCount(dataSize)` | `number` | Number of P2WSH outputs needed for a given data size. |
| `estimateChunkCount(dataSize)` | `number` | Number of 80-byte chunks needed. |
| `estimateFees(dataSize, feeRate, compressionRatio?)` | Fee estimates | Complete fee estimation for setup + reveal transactions. |

### Static Validation Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `validateHashCommittedScript(witnessScript)` | `boolean` | Validates script structure. |
| `extractDataHashes(witnessScript)` | `Uint8Array[] \| null` | Extracts committed HASH160 values from a script. |
| `extractPublicKey(witnessScript)` | `Uint8Array \| null` | Extracts the 33-byte public key from a script. |
| `verifyChunkCommitments(dataChunks, witnessScript)` | `boolean` | Verifies that data chunks match their hash commitments. |

---

## AddressGenerator

Static utility for generating Bitcoin addresses from hashes and public keys.

**Source:** `src/generators/AddressGenerator.ts`

### Static Methods

#### generatePKSH

```typescript
static generatePKSH(sha256Hash: Uint8Array, network: Network): string
```

Generates a P2WPKH SegWit address from a 32-byte SHA-256 hash by applying RIPEMD-160 and encoding with bech32.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sha256Hash` | `Uint8Array` | 32-byte SHA-256 hash. |
| `network` | `Network` | Bitcoin network. |

**Returns:** `string` -- A bech32 SegWit address (e.g., `bc1q...`).

#### generateTaprootAddress

```typescript
static generateTaprootAddress(pubKey: Uint8Array, network: { bech32: string }): string
```

Generates a Taproot (P2TR) address from a 32-byte x-only public key using bech32m encoding with witness version 1.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pubKey` | `Uint8Array` | 32-byte x-only public key. |
| `network` | `{ bech32: string }` | Network with bech32 prefix. |

**Returns:** `string` -- A bech32m Taproot address (e.g., `bc1p...`).

---

## MLDSAData

Data structures for ML-DSA (quantum-resistant) key linking operations.

**Source:** `src/generators/MLDSAData.ts`

### MLDSAPublicKeyMetadata

```typescript
enum MLDSAPublicKeyMetadata {
    MLDSA44 = 1312,   // Level 2 public key size
    MLDSA65 = 1952,   // Level 3 public key size
    MLDSA87 = 2592,   // Level 5 public key size
}
```

### MLDSARequestData

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

### getLevelFromPublicKeyLength

```typescript
function getLevelFromPublicKeyLength(length: number): MLDSASecurityLevel
```

Maps a public key byte length to its ML-DSA security level: 1312 bytes = Level 2, 1952 = Level 3, 2592 = Level 5.

---

## Script Structure

### Deployment Script Layout

```
[header(12)]           OP_TOALTSTACK
[challengePubKey(32)]  OP_TOALTSTACK
[challengeSolution]    OP_TOALTSTACK
[senderXPubKey(32)]    OP_DUP OP_HASH256 [expectedHash] OP_EQUALVERIFY OP_CHECKSIGVERIFY
[contractSaltPubKey]   OP_CHECKSIGVERIFY
                       OP_HASH256 [expectedSaltHash] OP_EQUALVERIFY
                       OP_DEPTH OP_1 OP_NUMEQUAL OP_IF
"op"                   [featureData...] OP_0 [calldataChunks...] OP_1NEGATE [bytecodeChunks...]
                       OP_ELSE OP_1 OP_ENDIF
```

### Interaction Script Layout

```
[header(12)]           OP_TOALTSTACK
[challengePubKey(32)]  OP_TOALTSTACK
[challengeSolution]    OP_TOALTSTACK
[senderXPubKey(32)]    OP_DUP OP_HASH256 [expectedHash] OP_EQUALVERIFY OP_CHECKSIGVERIFY
[contractSaltPubKey]   OP_CHECKSIGVERIFY
                       OP_HASH160 [expectedSecretHash] OP_EQUALVERIFY
                       OP_DEPTH OP_1 OP_NUMEQUAL OP_IF
"op"                   [featureData...] OP_1NEGATE [calldataChunks...]
                       OP_ELSE OP_1 OP_ENDIF
```

---

## Examples

### Generating a Deployment Script

```typescript
import { DeploymentGenerator, Compressor } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const generator = new DeploymentGenerator(
    senderPublicKey,
    contractSaltPubKey,
    networks.regtest,
);

const compressed = Compressor.compress(contractBytecode);
const script = generator.compile(
    compressed,
    contractSalt,
    challengeSolution,
    10_000n,         // max priority fee
    calldata,        // optional constructor calldata
    features,        // optional features
);
```

### Generating a Multi-Sig Script

```typescript
import { MultiSignGenerator } from '@btc-vision/transaction';

const script = MultiSignGenerator.compile(
    [pubkey1, pubkey2, pubkey3],  // signer public keys
    2,                             // require 2-of-3 signatures
);
```

### Generating a Contract Address

```typescript
import { AddressGenerator } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const segwitAddress = AddressGenerator.generatePKSH(sha256Hash, networks.bitcoin);
const taprootAddress = AddressGenerator.generateTaprootAddress(xOnlyPubKey, networks.bitcoin);
```

### Estimating Hash Commitment Fees

```typescript
import { HashCommitmentGenerator } from '@btc-vision/transaction';

const fees = HashCommitmentGenerator.estimateFees(
    50_000,   // 50 KB of data
    10,       // 10 sat/vB fee rate
    0.7,      // 70% compression ratio
);

console.log(`Outputs needed: ${fees.outputCount}`);
console.log(`Total cost: ${fees.totalCost} sats`);
```

---

## Related Documentation

- [Transaction Building](../transaction-building.md) -- How generators are used in the transaction building pipeline
- [ChallengeSolution](../epoch/challenge-solution.md) -- Challenge data embedded in scripts
- [Compressor](../utils/compressor.md) -- Bytecode compression before script embedding
- [BinaryWriter](../binary/binary-writer.md) -- Calldata encoding for contract interactions
