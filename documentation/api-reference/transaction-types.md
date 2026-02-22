# Transaction Types & Enums

Complete reference for all enumeration types and constant values used across the `@btc-vision/transaction` library.

---

## Navigation

- [Back to API Reference](../README.md#api-reference-1)
- [Interfaces](./interfaces.md)
- [Response Types](./response-types.md)

---

## TransactionType

Discriminates the kind of transaction being built. Each builder class maps to exactly one value.

**Source:** `src/transaction/enums/TransactionType.ts`

```typescript
enum TransactionType {
    GENERIC = 0,
    FUNDING = 1,
    DEPLOYMENT = 2,
    INTERACTION = 3,
    MULTI_SIG = 4,
    CUSTOM_CODE = 5,
    CANCEL = 6,
    CONSOLIDATED_SETUP = 7,
    CONSOLIDATED_REVEAL = 8,
}
```

| Value | Name | Description | Builder Class |
|-------|------|-------------|---------------|
| `0` | `GENERIC` | Base/untyped transaction | -- |
| `1` | `FUNDING` | BTC transfer (send funds between addresses) | `FundingTransaction` |
| `2` | `DEPLOYMENT` | Deploy a smart contract on OPNet | `DeploymentTransaction` |
| `3` | `INTERACTION` | Call a function on a deployed contract | `InteractionTransaction`, `ConsolidatedInteractionTransaction` |
| `4` | `MULTI_SIG` | M-of-N multi-signature transaction | `MultiSignTransaction` |
| `5` | `CUSTOM_CODE` | Arbitrary Bitcoin script execution | `CustomScriptTransaction` |
| `6` | `CANCEL` | Cancel/recover a stuck transaction | `CancelTransaction` |
| `7` | `CONSOLIDATED_SETUP` | First phase of a consolidated interaction (create P2WSH commitments) | `ConsolidatedInteractionTransaction` (setup) |
| `8` | `CONSOLIDATED_REVEAL` | Second phase of a consolidated interaction (reveal data in witnesses) | `ConsolidatedInteractionTransaction` (reveal) |

### Usage

```typescript
import { TransactionType } from '@btc-vision/transaction';

// Used internally by transaction builders
const builder = new FundingTransaction(params);
console.log(builder.type); // TransactionType.FUNDING (1)

// Used in offline transaction serialization headers
const state = OfflineTransactionManager.inspect(serializedState);
console.log(state.header.transactionType); // TransactionType.DEPLOYMENT (2)
```

---

## ChainId

Identifies the target blockchain network for cross-chain disambiguation.

**Source:** `src/network/ChainId.ts`

```typescript
enum ChainId {
    Bitcoin = 0,
    Fractal = 1,
}
```

| Value | Name | Description |
|-------|------|-------------|
| `0` | `Bitcoin` | Bitcoin mainnet, testnet, opnetTestnet, or regtest |
| `1` | `Fractal` | Fractal Bitcoin network |

### Usage

```typescript
import { ChainId } from '@btc-vision/transaction';

const params: ITransactionParameters = {
    chainId: ChainId.Bitcoin,
    // ...other parameters
};
```

> **Note:** The `ChainId` is used in the offline serialization header and for protocol-level chain identification. The actual network (mainnet vs. testnet vs. regtest) is determined by the `network` parameter, which carries full network configuration.

---

## Features

Bit-flag enum for optional transaction features that can be attached to interaction calldata.

**Source:** `src/generators/Features.ts`

```typescript
enum Features {
    ACCESS_LIST = 0b1,       // 1
    EPOCH_SUBMISSION = 0b10, // 2
    MLDSA_LINK_PUBKEY = 0b100, // 4
}
```

| Value | Name | Description |
|-------|------|-------------|
| `0b1` (1) | `ACCESS_LIST` | Include pre-loaded storage slots (gas optimization for contract reads) |
| `0b10` (2) | `EPOCH_SUBMISSION` | Attach an epoch challenge submission to the transaction |
| `0b100` (4) | `MLDSA_LINK_PUBKEY` | Link an ML-DSA quantum public key to the sender's legacy address |

### FeaturePriority

Defines the ordering in which features are serialized into calldata.

```typescript
enum FeaturePriority {
    ACCESS_LIST = 1,
    EPOCH_SUBMISSION = 2,
    MLDSA_LINK_PUBKEY = 3,
}
```

| Priority | Feature | Description |
|----------|---------|-------------|
| `1` | `ACCESS_LIST` | Serialized first |
| `2` | `EPOCH_SUBMISSION` | Serialized second |
| `3` | `MLDSA_LINK_PUBKEY` | Serialized third |

### Feature Interfaces

Each feature type has a corresponding typed interface:

```typescript
interface Feature<T extends Features> {
    opcode: T;
    data: unknown;
    priority: number;
}

interface AccessListFeature extends Feature<Features.ACCESS_LIST> {
    data: LoadedStorage; // { [contractAddress: string]: string[] }
}

interface EpochSubmissionFeature extends Feature<Features.EPOCH_SUBMISSION> {
    data: ChallengeSubmission;
}

interface MLDSALinkRequest extends Feature<Features.MLDSA_LINK_PUBKEY> {
    data: MLDSARequestData;
}
```

### Usage

Features are typically set via transaction parameters rather than constructed directly:

```typescript
const interactionParams: IInteractionParameters = {
    // Enable access list feature
    loadedStorage: {
        'bc1p...contractAddress': ['0x01', '0x02'],
    },
    // Enable ML-DSA link
    linkMLDSAPublicKeyToAddress: true,
    revealMLDSAPublicKey: true,
    // ...other parameters
};
```

---

## SupportedTransactionVersion

A union type constraining the Bitcoin transaction version field.

**Source:** `src/transaction/interfaces/ITweakedTransactionData.ts`

```typescript
type SupportedTransactionVersion = 1 | 2 | 3;
```

| Value | Description |
|-------|-------------|
| `1` | Standard Bitcoin transaction (no relative lock-time) |
| `2` | BIP68/BIP112 transaction (enables `OP_CHECKSEQUENCEVERIFY`) |
| `3` | BIP431 transaction version 3 (enables TRUC/package relay policies) |

### Usage

```typescript
const params: ITweakedTransactionData = {
    txVersion: 2, // Enable CSV support
    // ...
};
```

---

## MLDSASecurityLevel

Specifies the security level for ML-DSA (Module-Lattice Digital Signature Algorithm) keys. Imported from `@btc-vision/bip32`.

```typescript
enum MLDSASecurityLevel {
    LEVEL2 = 2, // ML-DSA-44
    LEVEL3 = 3, // ML-DSA-65
    LEVEL5 = 5, // ML-DSA-87
}
```

| Value | Name | Algorithm | Public Key Size | Signature Size | NIST Security | Notes |
|-------|------|-----------|-----------------|----------------|---------------|-------|
| `2` | `LEVEL2` | ML-DSA-44 | 1,312 bytes | 2,420 bytes | Category 2 | BIP360 recommended default |
| `3` | `LEVEL3` | ML-DSA-65 | 1,952 bytes | 3,309 bytes | Category 3 | Intermediate security |
| `5` | `LEVEL5` | ML-DSA-87 | 2,592 bytes | 4,627 bytes | Category 5 | Maximum security |

### MLDSAPublicKeyMetadata

Maps security levels to their corresponding public key byte lengths.

**Source:** `src/generators/MLDSAData.ts`

```typescript
enum MLDSAPublicKeyMetadata {
    MLDSA44 = 1312,
    MLDSA65 = 1952,
    MLDSA87 = 2592,
}
```

### Usage

```typescript
import { MLDSASecurityLevel } from '@btc-vision/bip32';
import { AddressVerificator } from '@btc-vision/transaction';

// Detect ML-DSA level from a public key
const level = AddressVerificator.isValidMLDSAPublicKey(publicKeyHex);
// Returns MLDSASecurityLevel.LEVEL2, .LEVEL3, .LEVEL5, or null

// Current link requests only support LEVEL2
if (level !== MLDSASecurityLevel.LEVEL2) {
    throw new Error('Only MLDSA level 2 is supported for link requests');
}
```

---

## AddressTypes

Identifies the type of a Bitcoin address or script.

**Source:** `src/keypair/AddressVerificator.ts`

```typescript
enum AddressTypes {
    P2PKH = 'P2PKH',
    P2OP = 'P2OP',
    P2SH_OR_P2SH_P2WPKH = 'P2SH_OR_P2SH-P2WPKH',
    P2PK = 'P2PK',
    P2TR = 'P2TR',
    P2MR = 'P2MR',
    P2WPKH = 'P2WPKH',
    P2WSH = 'P2WSH',
    P2WDA = 'P2WDA',
}
```

| Value | Name | Prefix | Description |
|-------|------|--------|-------------|
| `'P2PKH'` | `P2PKH` | `1...` | Pay-to-Public-Key-Hash (legacy) |
| `'P2OP'` | `P2OP` | `bcrt1s...` / `bc1s...` | Pay-to-OPNet (witness v16, smart contract addresses) |
| `'P2SH_OR_P2SH-P2WPKH'` | `P2SH_OR_P2SH_P2WPKH` | `3...` | Pay-to-Script-Hash or P2SH-wrapped SegWit |
| `'P2PK'` | `P2PK` | Raw public key | Pay-to-Public-Key (raw, no address encoding) |
| `'P2TR'` | `P2TR` | `bc1p...` | Pay-to-Taproot (witness v1) |
| `'P2MR'` | `P2MR` | `bc1z...` | Pay-to-Merkle-Root / BIP 360 (witness v2, quantum-safe) |
| `'P2WPKH'` | `P2WPKH` | `bc1q...` | Pay-to-Witness-Public-Key-Hash (native SegWit v0) |
| `'P2WSH'` | `P2WSH` | `bc1q...` (longer) | Pay-to-Witness-Script-Hash (native SegWit v0) |
| `'P2WDA'` | `P2WDA` | `bc1q...` (P2WSH) | Pay-to-Witness-Data-Authentication (quantum-resistant witness) |

### Usage

```typescript
import { AddressVerificator, AddressTypes } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const type = AddressVerificator.detectAddressType('bc1p...', networks.bitcoin);
// Returns AddressTypes.P2TR

// With witness script for P2WDA detection
const typeWithWitness = AddressVerificator.detectAddressTypeWithWitnessScript(
    address,
    networks.bitcoin,
    witnessScript,
);
// Returns AddressTypes.P2WDA if witness script matches P2WDA pattern
```

---

## TransactionSequence

Controls the `nSequence` field for individual transaction inputs.

**Source:** `src/transaction/shared/TweakedTransaction.ts`

```typescript
enum TransactionSequence {
    REPLACE_BY_FEE = 0xfffffffd,
    FINAL = 0xffffffff,
}
```

| Value | Name | Description |
|-------|------|-------------|
| `0xfffffffd` | `REPLACE_BY_FEE` | Signals BIP125 RBF opt-in (allows fee bumping) |
| `0xffffffff` | `FINAL` | Final sequence (no RBF, no relative lock-time) |

---

## CSVModes

Determines how `OP_CHECKSEQUENCEVERIFY` interprets the lock-time value.

**Source:** `src/transaction/shared/TweakedTransaction.ts`

```typescript
enum CSVModes {
    BLOCKS = 0,
    TIMESTAMPS = 1,
}
```

| Value | Name | Description |
|-------|------|-------------|
| `0` | `BLOCKS` | Lock-time measured in blocks |
| `1` | `TIMESTAMPS` | Lock-time measured in 512-second intervals |

---

## See Also

- [Interfaces](./interfaces.md) -- All TypeScript interfaces used by these types
- [Response Types](./response-types.md) -- Return types from `TransactionFactory` methods
- [Address Types Overview](../addresses/address-types.md) -- Detailed address format documentation
