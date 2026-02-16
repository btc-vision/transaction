# EpochValidator

Low-level validation utilities for OPNet epoch mining solutions and proofs.

## Overview

`EpochValidator` is a static utility class that provides all the cryptographic primitives and validation logic for the OPNet epoch mining system. It computes preimages, hashes, difficulty scores, and validates complete epoch solutions. It is used internally by `ChallengeSolution` but can also be called directly for lightweight validation without constructing full challenge objects.

The epoch system divides blockchain time into epochs of 5 blocks. Miners find solutions by XOR-ing a target checksum with their public key and a random salt, then SHA-1 hashing the result. The number of matching leading bits between the hash and the target determines the solution's difficulty.

**Source:** `src/epoch/validator/EpochValidator.ts`

## Table of Contents

- [Import](#import)
- [Constants](#constants)
- [Static Methods](#static-methods)
  - [sha1](#sha1)
  - [calculatePreimage](#calculatepreimage)
  - [countMatchingBits](#countmatchingbits)
  - [calculateSolution](#calculatesolution)
  - [verifySolution](#verifysolution)
  - [validateEpochWinner](#validateepochwinner)
  - [validateChallengeSolution](#validatechallengesolution)
  - [checkDifficulty](#checkdifficulty)
  - [getMiningTargetBlock](#getminingtargetblock)
- [Validation Algorithm](#validation-algorithm)
- [Examples](#examples)
- [Related Documentation](#related-documentation)

---

## Import

```typescript
import { EpochValidator } from '@btc-vision/transaction';
```

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `BLOCKS_PER_EPOCH` | `5n` | Number of Bitcoin blocks per OPNet epoch. |

---

## Static Methods

### sha1

```typescript
static sha1(data: Uint8Array): Uint8Array
```

Computes the SHA-1 hash of the given data. Uses the `crypto.sha1` function from `@btc-vision/bitcoin`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Uint8Array` | The data to hash. |

**Returns:** `Uint8Array` -- The 20-byte SHA-1 hash.

### calculatePreimage

```typescript
static calculatePreimage(
    checksumRoot: Uint8Array,
    publicKey: Uint8Array,
    salt: Uint8Array,
): Uint8Array
```

Calculates the mining preimage by XOR-ing three 32-byte inputs byte-by-byte.

| Parameter | Type | Description |
|-----------|------|-------------|
| `checksumRoot` | `Uint8Array` | The 32-byte target checksum from the epoch. |
| `publicKey` | `Uint8Array` | The 32-byte miner public key. |
| `salt` | `Uint8Array` | The 32-byte random salt chosen by the miner. |

**Returns:** `Uint8Array` -- The 32-byte preimage (`checksumRoot XOR publicKey XOR salt`).

**Throws:** `Error('All inputs must be 32 bytes')` if any input is not exactly 32 bytes.

### countMatchingBits

```typescript
static countMatchingBits(hash1: Uint8Array, hash2: Uint8Array): number
```

Counts the number of consecutive matching leading bits between two hashes. The count starts from the most significant bit of the first byte and stops at the first bit mismatch.

| Parameter | Type | Description |
|-----------|------|-------------|
| `hash1` | `Uint8Array` | First hash. |
| `hash2` | `Uint8Array` | Second hash (must be the same length as `hash1`). |

**Returns:** `number` -- The number of consecutive matching leading bits.

**Throws:** `Error('Hashes must be of the same length')` if the hashes have different lengths.

**Example:**
```
hash1: 11010110 01010101 ...
hash2: 11010110 01110101 ...
               ^-- first mismatch at bit 10
Result: 10 matching bits
```

### calculateSolution

```typescript
static calculateSolution(
    targetChecksum: Uint8Array,
    publicKey: Uint8Array,
    salt: Uint8Array,
): Uint8Array
```

Convenience method that computes `SHA1(calculatePreimage(targetChecksum, publicKey, salt))`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `targetChecksum` | `Uint8Array` | The 32-byte target checksum. |
| `publicKey` | `Uint8Array` | The 32-byte miner public key. |
| `salt` | `Uint8Array` | The 32-byte salt. |

**Returns:** `Uint8Array` -- The 20-byte SHA-1 solution hash.

### verifySolution

```typescript
static verifySolution(challenge: IChallengeSolution, log?: boolean): boolean
```

Verifies a complete challenge solution by:
1. Recalculating the preimage from `targetChecksum`, `publicKey`, and `salt`.
2. Computing SHA-1 of the preimage.
3. Checking that the computed hash matches the stored `solution`.
4. Verifying the difficulty (matching bits) matches the claimed difficulty.
5. Validating the block range (`startBlock` and `endBlock`) against the epoch number.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `challenge` | `IChallengeSolution` | -- | The challenge solution to verify. |
| `log` | `boolean` | `false` | Whether to log errors to console. |

**Returns:** `boolean` -- `true` if all checks pass.

### validateEpochWinner

```typescript
static validateEpochWinner(epochData: RawChallenge): boolean
```

Validates an epoch winner from raw string data without requiring a `ChallengeSolution` instance. Performs the same verification as `verifySolution` but parses the raw data inline.

| Parameter | Type | Description |
|-----------|------|-------------|
| `epochData` | `RawChallenge` | The raw challenge data with string values. |

**Returns:** `boolean` -- `true` if the solution is valid.

### validateChallengeSolution

```typescript
static validateChallengeSolution(challenge: IChallengeSolution): boolean
```

Validates a challenge from an `IChallengeSolution` instance. Equivalent to calling `verifySolution(challenge)`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `challenge` | `IChallengeSolution` | The challenge solution instance to validate. |

**Returns:** `boolean`

### checkDifficulty

```typescript
static checkDifficulty(
    solution: Uint8Array,
    targetHash: Uint8Array,
    minDifficulty: number,
): { valid: boolean; difficulty: number }
```

Checks whether a solution meets a minimum difficulty requirement.

| Parameter | Type | Description |
|-----------|------|-------------|
| `solution` | `Uint8Array` | The solution hash. |
| `targetHash` | `Uint8Array` | The target hash to compare against. |
| `minDifficulty` | `number` | The minimum number of matching leading bits required. |

**Returns:** `{ valid: boolean; difficulty: number }` -- Whether the difficulty requirement is met and the actual difficulty level.

### getMiningTargetBlock

```typescript
static getMiningTargetBlock(epochNumber: bigint): bigint | null
```

Returns the block number that miners should target for the given epoch.

| Parameter | Type | Description |
|-----------|------|-------------|
| `epochNumber` | `bigint` | The epoch number. |

**Returns:** `bigint | null` -- The last block of the previous epoch (`epochNumber * 5 - 1`), or `null` for epoch 0.

---

## Validation Algorithm

The complete validation flow for an epoch solution:

```
Input: epochNumber, publicKey (32 bytes), salt (32 bytes),
       solution, difficulty, verification.targetChecksum,
       verification.targetHash, verification.startBlock,
       verification.endBlock

Step 1: Calculate preimage
    preimage[i] = targetChecksum[i] XOR publicKey[i] XOR salt[i]
    for i in 0..31

Step 2: Hash the preimage
    computedSolution = SHA1(preimage)    // 20 bytes

Step 3: Verify solution matches
    if computedSolution != solution: FAIL

Step 4: Verify difficulty
    matchingBits = countMatchingLeadingBits(computedSolution, targetHash)
    if matchingBits != difficulty: FAIL

Step 5: Verify block range
    expectedStart = epochNumber * 5
    expectedEnd = expectedStart + 4
    if startBlock != expectedStart OR endBlock != expectedEnd: FAIL

Result: PASS
```

---

## Examples

### Validating Raw Epoch Data

```typescript
import { EpochValidator } from '@btc-vision/transaction';

const rawData = {
    epochNumber: '100',
    mldsaPublicKey: '0x...',
    legacyPublicKey: '0x02...',
    solution: '0x...',
    salt: '0x...',
    graffiti: '0x...',
    difficulty: 22,
    verification: {
        epochHash: '0x...',
        epochRoot: '0x...',
        targetHash: '0x...',
        targetChecksum: '0x...',
        startBlock: '500',
        endBlock: '504',
        proofs: ['0x...'],
    },
};

const isValid = EpochValidator.validateEpochWinner(rawData);
console.log(`Epoch 100 winner valid: ${isValid}`);
```

### Calculating a Solution

```typescript
const targetChecksum = new Uint8Array(32);  // from epoch data
const publicKey = new Uint8Array(32);       // miner's public key
const salt = new Uint8Array(32);            // random salt

const solution = EpochValidator.calculateSolution(targetChecksum, publicKey, salt);
console.log(`Solution (${solution.length} bytes)`);
```

### Checking Difficulty

```typescript
const solution = new Uint8Array(20);   // SHA-1 hash
const targetHash = new Uint8Array(20); // epoch target

const result = EpochValidator.checkDifficulty(solution, targetHash, 16);
console.log(`Difficulty: ${result.difficulty}, meets minimum: ${result.valid}`);
```

### Getting the Mining Target Block

```typescript
const targetBlock = EpochValidator.getMiningTargetBlock(42n);
// targetBlock = 42n * 5n - 1n = 209n

const epoch0 = EpochValidator.getMiningTargetBlock(0n);
// epoch0 = null (epoch 0 cannot be mined)
```

---

## Related Documentation

- [ChallengeSolution](./challenge-solution.md) -- High-level challenge solution class
- [Generators](../generators/generators.md) -- How challenge data is embedded in transaction scripts
