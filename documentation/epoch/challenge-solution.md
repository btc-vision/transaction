# ChallengeSolution

Represents and validates epoch mining challenge solutions in the OPNet proof-of-work system.

## Overview

The epoch mining system in OPNet divides blockchain time into epochs of 5 blocks each. Miners compete to find solutions that match a target hash with a certain number of leading matching bits (the difficulty). A `ChallengeSolution` encapsulates all the data needed to represent, validate, and submit a mining solution: the epoch number, the miner's public key, the cryptographic solution, a salt, optional graffiti, the difficulty level, and verification proofs.

The module exports three classes:
- **`ChallengeSolution`** -- The main class holding the complete challenge solution.
- **`ChallengeVerification`** -- Epoch verification data (hashes, block range, Merkle proofs).
- **`ChallengeSubmission`** -- A signed submission of a solution for a future epoch.

**Source:** `src/epoch/ChallengeSolution.ts`

## Table of Contents

- [Import](#import)
- [Interfaces and Types](#interfaces-and-types)
  - [IChallengeSolution](#ichallengesolution)
  - [IChallengeVerification](#ichallengeverification)
  - [IChallengeSubmission](#ichallengesubmission)
  - [RawChallenge](#rawchallenge)
  - [RawChallengeVerification](#rawchallengeverification)
  - [RawChallengeSubmission](#rawchallengesubmission)
- [ChallengeVerification Class](#challengeverification-class)
- [ChallengeSubmission Class](#challengesubmission-class)
- [ChallengeSolution Class](#challengesolution-class)
  - [Constructor](#constructor)
  - [Properties](#properties)
  - [Static Methods](#static-methods)
  - [Instance Methods](#instance-methods)
- [How Epoch Mining Works](#how-epoch-mining-works)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Import

```typescript
import {
    ChallengeSolution,
    ChallengeVerification,
    ChallengeSubmission,
} from '@btc-vision/transaction';
```

---

## Interfaces and Types

### IChallengeSolution

The full interface for a challenge solution.

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

### IChallengeVerification

Verification data proving the epoch state used for the challenge.

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
| `epochHash` | `Uint8Array` | The hash of the epoch data. |
| `epochRoot` | `Uint8Array` | The Merkle root of the epoch. |
| `targetHash` | `Uint8Array` | The hash that solutions are compared against for difficulty. |
| `targetChecksum` | `Uint8Array` | The checksum used in the XOR preimage calculation (32 bytes). |
| `startBlock` | `bigint` | The first block number in this epoch. |
| `endBlock` | `bigint` | The last block number in this epoch. |
| `proofs` | `readonly Uint8Array[]` | Merkle proofs for epoch verification. |

### IChallengeSubmission

A signed submission of a challenge solution.

```typescript
interface IChallengeSubmission {
    readonly publicKey: Address;
    readonly solution: Uint8Array;
    readonly graffiti: Uint8Array | undefined;
    readonly signature: Uint8Array;
    readonly epochNumber: bigint;
    verifySignature(): boolean;
}
```

### RawChallenge

Serializable representation of a challenge solution (all values as strings).

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

### RawChallengeVerification

```typescript
interface RawChallengeVerification {
    readonly epochHash: string;
    readonly epochRoot: string;
    readonly targetHash: string;
    readonly targetChecksum: string;
    readonly startBlock: string;
    readonly endBlock: string;
    readonly proofs: readonly string[];
}
```

### RawChallengeSubmission

```typescript
interface RawChallengeSubmission {
    readonly mldsaPublicKey: string;
    readonly legacyPublicKey: string;
    readonly solution: string;
    readonly graffiti?: string;
    readonly signature: string;
}
```

---

## ChallengeVerification Class

Parses and stores epoch verification data from raw string format.

```typescript
class ChallengeVerification implements IChallengeVerification {
    constructor(data: RawChallengeVerification)
}
```

The constructor converts all hex strings to `Uint8Array` and all numeric strings to `bigint`.

| Property | Type | Description |
|----------|------|-------------|
| `epochHash` | `Uint8Array` | Parsed epoch hash. |
| `epochRoot` | `Uint8Array` | Parsed epoch Merkle root. |
| `targetHash` | `Uint8Array` | Parsed target hash for difficulty comparison. |
| `targetChecksum` | `Uint8Array` | Parsed target checksum for preimage XOR. |
| `startBlock` | `bigint` | First block of the epoch. |
| `endBlock` | `bigint` | Last block of the epoch. |
| `proofs` | `readonly Uint8Array[]` | Frozen array of parsed Merkle proof elements. |

---

## ChallengeSubmission Class

Represents a signed submission for a future epoch (typically `epochNumber + 2`).

```typescript
class ChallengeSubmission implements IChallengeSubmission {
    constructor(data: RawChallengeSubmission, epochNumber: bigint)
}
```

| Property | Type | Description |
|----------|------|-------------|
| `publicKey` | `Address` | The submitter's address (MLDSA + legacy keys). |
| `solution` | `Uint8Array` | The submitted solution bytes. |
| `graffiti` | `Uint8Array \| undefined` | Optional graffiti data. |
| `signature` | `Uint8Array` | The Schnorr signature over the submission data. |
| `epochNumber` | `bigint` | The epoch this submission targets. |

### verifySignature

```typescript
public verifySignature(): boolean
```

Verifies the Schnorr signature over `[publicKey, epochNumber, solution, graffiti?]`. Returns `true` if the signature is valid.

---

## ChallengeSolution Class

The main class that encapsulates a complete epoch mining challenge solution.

### Constructor

```typescript
const challenge = new ChallengeSolution(data: RawChallenge);
```

Parses all fields from the raw string-based format. If the raw data includes a `submission`, it creates a `ChallengeSubmission` for epoch `epochNumber + 2`.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `epochNumber` | `bigint` | The epoch number this solution is for. |
| `publicKey` | `Address` | The miner's address (MLDSA + legacy public keys). |
| `solution` | `Uint8Array` | The SHA-1 hash of the preimage (the "solution"). |
| `salt` | `Uint8Array` | 32-byte random salt used in the preimage. |
| `graffiti` | `Uint8Array` | Arbitrary data embedded by the miner (like a coinbase message). |
| `difficulty` | `number` | Number of matching leading bits between solution and target hash. |
| `verification` | `ChallengeVerification` | Epoch verification data (hashes, block range, proofs). |

### Static Methods

#### validateRaw

```typescript
static validateRaw(data: RawChallenge): boolean
```

Validates a challenge solution directly from raw string data without constructing a full `ChallengeSolution` instance. Delegates to `EpochValidator.validateEpochWinner()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `RawChallenge` | The raw challenge data to validate. |

**Returns:** `boolean` -- `true` if the solution is valid.

### Instance Methods

#### verify

```typescript
public verify(): boolean
```

Validates this challenge solution by verifying the preimage calculation, SHA-1 hash, difficulty match, and block range. Delegates to `EpochValidator.validateChallengeSolution()`.

**Returns:** `boolean` -- `true` if the challenge is valid.

#### getSubmission

```typescript
public getSubmission(): ChallengeSubmission | undefined
```

Returns the challenge submission if present and its signature is valid.

**Returns:** `ChallengeSubmission | undefined` -- The verified submission, or `undefined` if none exists.

**Throws:** `Error('No submission provided in request.')` if accessed on a challenge without a submission. `Error('Invalid submission signature.')` if the signature verification fails.

#### verifySubmissionSignature

```typescript
public verifySubmissionSignature(): boolean
```

Verifies the Schnorr signature on the embedded submission.

**Returns:** `boolean`

**Throws:** `Error` if no submission is present.

#### toBuffer

```typescript
public toBuffer(): Uint8Array
```

Returns the solution bytes as a `Uint8Array`.

#### toHex

```typescript
public toHex(): string
```

Returns the solution as a `0x`-prefixed hex string.

#### toRaw

```typescript
public toRaw(): RawChallenge
```

Serializes the challenge back to the raw string format suitable for JSON transmission.

#### calculateSolution

```typescript
public calculateSolution(): Uint8Array
```

Recalculates the expected solution hash from the preimage components (`targetChecksum XOR publicKey XOR salt`, then SHA-1). Useful for verifying that the stored solution matches the calculated value.

**Returns:** `Uint8Array` -- The SHA-1 hash of the preimage.

#### checkDifficulty

```typescript
public checkDifficulty(minDifficulty: number): { valid: boolean; difficulty: number }
```

Checks whether the solution meets a minimum difficulty requirement.

| Parameter | Type | Description |
|-----------|------|-------------|
| `minDifficulty` | `number` | The minimum number of matching leading bits required. |

**Returns:** `{ valid: boolean; difficulty: number }` -- Whether the difficulty is met, and the actual difficulty.

#### getMiningTargetBlock

```typescript
public getMiningTargetBlock(): bigint | null
```

Returns the block number that miners should target for this epoch. For epoch 0, returns `null` (cannot be mined). For other epochs, returns `epochNumber * 5 - 1` (the last block of the previous epoch).

**Returns:** `bigint | null`

---

## How Epoch Mining Works

OPNet divides blockchain time into **epochs** of 5 blocks each:

```
Epoch 0: blocks 0-4
Epoch 1: blocks 5-9
Epoch 2: blocks 10-14
...
Epoch N: blocks (N*5) to (N*5 + 4)
```

**Mining process:**

1. At the end of each epoch, a `targetChecksum` and `targetHash` are derived from the epoch's state.

2. Miners attempt to find a **salt** such that:
   ```
   preimage = targetChecksum XOR publicKey XOR salt    (byte-by-byte, 32 bytes)
   solution = SHA1(preimage)                           (20 bytes)
   difficulty = countMatchingLeadingBits(solution, targetHash)
   ```

3. The miner with the highest `difficulty` (most matching leading bits) wins the epoch reward.

4. Solutions can be submitted for a future epoch (`epochNumber + 2`) via the `ChallengeSubmission` mechanism, which includes a Schnorr signature to prove authorship.

---

## Examples

### Validating a Challenge from Raw Data

```typescript
import { ChallengeSolution } from '@btc-vision/transaction';

const rawData: RawChallenge = {
    epochNumber: '42',
    mldsaPublicKey: '0xabcd...',
    legacyPublicKey: '0x02abcd...',
    solution: '0x1234...',
    salt: '0x5678...',
    graffiti: '0xdeadbeef...',
    difficulty: 18,
    verification: {
        epochHash: '0x...',
        epochRoot: '0x...',
        targetHash: '0x...',
        targetChecksum: '0x...',
        startBlock: '210',
        endBlock: '214',
        proofs: ['0x...', '0x...'],
    },
};

// Quick validation without full object construction
const isValid = ChallengeSolution.validateRaw(rawData);
console.log(`Valid: ${isValid}`);

// Full object with methods
const challenge = new ChallengeSolution(rawData);
console.log(`Epoch: ${challenge.epochNumber}`);
console.log(`Difficulty: ${challenge.difficulty}`);
console.log(`Valid: ${challenge.verify()}`);
console.log(`Solution hex: ${challenge.toHex()}`);
```

### Checking Difficulty Requirements

```typescript
const challenge = new ChallengeSolution(rawData);

const result = challenge.checkDifficulty(16);
if (result.valid) {
    console.log(`Solution meets minimum difficulty: ${result.difficulty} bits`);
} else {
    console.log(`Insufficient difficulty: ${result.difficulty} < 16`);
}
```

### Getting Mining Target Block

```typescript
const challenge = new ChallengeSolution(rawData);
const targetBlock = challenge.getMiningTargetBlock();

if (targetBlock !== null) {
    console.log(`Mine at block: ${targetBlock}`);
} else {
    console.log('Epoch 0 cannot be mined');
}
```

### Serializing for Transmission

```typescript
const challenge = new ChallengeSolution(rawData);
const raw = challenge.toRaw();
const json = JSON.stringify(raw);
// Send over the network...
```

---

## Related Documentation

- [EpochValidator](./epoch-validator.md) -- Low-level epoch validation and proof verification
- [Generators](../generators/generators.md) -- Script generators that embed challenge data in transactions
- [Transaction Building](../transaction-building.md) -- How challenge solutions are included in transactions
