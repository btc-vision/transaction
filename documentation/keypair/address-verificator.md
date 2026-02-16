# AddressVerificator

Provides static utility methods for validating and detecting Bitcoin address types. `AddressVerificator` can identify P2PKH, P2WPKH, P2TR, P2WSH, P2SH, P2OP, and P2WDA addresses, validate public keys (both classical and ML-DSA), and determine whether a P2WSH address is actually a P2WDA address by inspecting its witness script.

This class is entirely static and is not meant to be instantiated.

## Table of Contents

- [Import](#import)
- [Enums and Interfaces](#enums-and-interfaces)
  - [AddressTypes](#addresstypes)
  - [ValidatedP2WDAAddress](#validatedp2wdaaddress)
- [Taproot Validation](#taproot-validation)
  - [isValidP2TRAddress()](#isvalidp2traddress)
- [SegWit Validation](#segwit-validation)
  - [isP2WPKHAddress()](#isp2wpkhaddress)
- [Legacy Address Validation](#legacy-address-validation)
  - [isP2PKHOrP2SH()](#isp2pkhorP2SH)
  - [requireRedeemScript()](#requireredeemscript)
- [OPNet Address Validation](#opnet-address-validation)
  - [isValidP2OPAddress()](#isvalidp2opaddress)
- [Public Key Validation](#public-key-validation)
  - [isValidPublicKey()](#isvalidpublickey)
  - [isValidMLDSAPublicKey()](#isvalidmldsapublickey)
- [P2WDA Validation](#p2wda-validation)
  - [isP2WDAWitnessScript()](#isp2wdawitnessscript)
  - [validateP2WDAAddress()](#validatep2wdaaddress)
- [Address Type Detection](#address-type-detection)
  - [detectAddressType()](#detectaddresstype)
  - [detectAddressTypeWithWitnessScript()](#detectaddresstypewithwitnessscript)
- [Code Examples](#code-examples)
- [Best Practices](#best-practices)
- [Related Documentation](#related-documentation)

## Import

```typescript
import { AddressVerificator, AddressTypes } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
```

## Enums and Interfaces

### AddressTypes

An enum representing all recognized Bitcoin address types.

```typescript
enum AddressTypes {
    P2PKH                = 'P2PKH',
    P2OP                 = 'P2OP',
    P2SH_OR_P2SH_P2WPKH = 'P2SH_OR_P2SH-P2WPKH',
    P2PK                 = 'P2PK',
    P2TR                 = 'P2TR',
    P2WPKH               = 'P2WPKH',
    P2WSH                = 'P2WSH',
    P2WDA                = 'P2WDA',
}
```

| Value | Description |
|-------|-------------|
| `P2PKH` | Legacy Pay-to-Public-Key-Hash (starts with `1`). |
| `P2OP` | Pay-to-OPNet (witness version 16, bech32m). |
| `P2SH_OR_P2SH_P2WPKH` | Pay-to-Script-Hash or nested SegWit (starts with `3`). Cannot distinguish without the redeem script. |
| `P2PK` | Pay-to-Public-Key (detected when input is a valid public key hex). |
| `P2TR` | Pay-to-Taproot (witness version 1, 32-byte program, starts with `bc1p`). |
| `P2WPKH` | Pay-to-Witness-Public-Key-Hash (witness version 0, 20-byte program, starts with `bc1q`). |
| `P2WSH` | Pay-to-Witness-Script-Hash (witness version 0, 32-byte program, starts with `bc1q`). |
| `P2WDA` | Pay-to-Witness-Data-Authentication (a P2WSH variant with a specific witness script pattern). |

### ValidatedP2WDAAddress

The result of a detailed P2WDA address validation.

```typescript
interface ValidatedP2WDAAddress {
    readonly isValid: boolean;
    readonly isPotentiallyP2WDA: boolean;
    readonly isDefinitelyP2WDA: boolean;
    readonly publicKey?: Uint8Array;
    readonly error?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `isValid` | `boolean` | Whether the base address structure is valid. |
| `isPotentiallyP2WDA` | `boolean` | Whether the address could be a P2WDA (is a valid P2WSH). |
| `isDefinitelyP2WDA` | `boolean` | Whether the witness script confirms a P2WDA pattern. |
| `publicKey` | `Uint8Array \| undefined` | The public key extracted from the P2WDA witness script, if confirmed. |
| `error` | `string \| undefined` | Error message if validation failed. |

## Taproot Validation

### isValidP2TRAddress()

```typescript
static isValidP2TRAddress(inAddress: string, network: Network): boolean
```

Validates whether a string is a valid Taproot (P2TR) address on the given network. Checks bech32m encoding, witness version 1, and the ability to produce a valid output script.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inAddress` | `string` | Yes | The address string to validate. |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `boolean`

```typescript
const isP2TR = AddressVerificator.isValidP2TRAddress('bc1p...', networks.bitcoin);
console.log(isP2TR); // true
```

## SegWit Validation

### isP2WPKHAddress()

```typescript
static isP2WPKHAddress(inAddress: string, network: Network): boolean
```

Validates whether a string is a valid native SegWit (P2WPKH) address. Checks bech32 encoding, witness version 0, and 20-byte program length.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inAddress` | `string` | Yes | The address string to validate. |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `boolean`

```typescript
const isSegWit = AddressVerificator.isP2WPKHAddress('bc1q...', networks.bitcoin);
console.log(isSegWit); // true
```

## Legacy Address Validation

### isP2PKHOrP2SH()

```typescript
static isP2PKHOrP2SH(addy: string, network: Network): boolean
```

Validates whether a string is a valid P2PKH or P2SH address (base58check encoded).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `addy` | `string` | Yes | The address string to validate. |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `boolean` -- `true` if the address decodes as either P2PKH or P2SH on the given network.

```typescript
const isLegacy = AddressVerificator.isP2PKHOrP2SH('1A1zP1...', networks.bitcoin);
console.log(isLegacy); // true
```

### requireRedeemScript()

```typescript
static requireRedeemScript(addy: string, network: Network): boolean
```

Determines whether the address is a P2SH address that requires a redeem script for spending. Returns `false` for P2PKH addresses.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `addy` | `string` | Yes | The address string to check. |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `boolean` -- `true` if the address is P2SH (requires a redeem script), `false` otherwise.

## OPNet Address Validation

### isValidP2OPAddress()

```typescript
static isValidP2OPAddress(inAddress: string, network: Network): boolean
```

Validates whether a string is a valid P2OP (Pay-to-OPNet) address. Checks for witness version 16 and a 21-byte witness program.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inAddress` | `string` | Yes | The address string to validate. |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `boolean`

```typescript
const isP2OP = AddressVerificator.isValidP2OPAddress('bc1s...', networks.bitcoin);
console.log(isP2OP); // true or false
```

## Public Key Validation

### isValidPublicKey()

```typescript
static isValidPublicKey(input: string, network: Network): boolean
```

Validates whether a hex string represents a valid classical Bitcoin public key. Supports compressed (33-byte), uncompressed (65-byte), x-only (32-byte), and hybrid (65-byte with prefix `0x06` or `0x07`) formats.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | `string` | Yes | The hex-encoded public key (with optional `0x` prefix). |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `boolean`

```typescript
const isValid = AddressVerificator.isValidPublicKey(
    '0x020373626d317ae8788ce3280b491068610d840c23ecb64c14075bbb9f670af52c',
    networks.bitcoin,
);
console.log(isValid); // true
```

### isValidMLDSAPublicKey()

```typescript
static isValidMLDSAPublicKey(input: string | Uint8Array): MLDSASecurityLevel | null
```

Validates whether the input is a valid ML-DSA public key based on its byte length. Returns the corresponding security level if valid, or `null` if the key length does not match any ML-DSA variant.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | `string \| Uint8Array` | Yes | The public key as hex string (with optional `0x` prefix) or raw bytes. |

**Returns:** `MLDSASecurityLevel | null`

| Byte Length | Security Level | ML-DSA Variant |
|-------------|---------------|----------------|
| 1312 | `MLDSASecurityLevel.LEVEL2` | ML-DSA-44 |
| 1952 | `MLDSASecurityLevel.LEVEL3` | ML-DSA-65 |
| 2592 | `MLDSASecurityLevel.LEVEL5` | ML-DSA-87 |

```typescript
const level = AddressVerificator.isValidMLDSAPublicKey('0xaabb...');
if (level !== null) {
    console.log('Valid ML-DSA key at security level:', level);
} else {
    console.log('Not a valid ML-DSA public key');
}
```

## P2WDA Validation

### isP2WDAWitnessScript()

```typescript
static isP2WDAWitnessScript(witnessScript: Uint8Array): boolean
```

Checks whether a witness script matches the P2WDA pattern: `(OP_2DROP * 5) <pubkey> OP_CHECKSIG`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `witnessScript` | `Uint8Array` | Yes | The raw witness script bytes. |

**Returns:** `boolean`

```typescript
const isP2WDA = AddressVerificator.isP2WDAWitnessScript(witnessScript);
console.log(isP2WDA); // true if witness script matches P2WDA pattern
```

### validateP2WDAAddress()

```typescript
static validateP2WDAAddress(
    address: string,
    network: Network,
    witnessScript?: Uint8Array,
): ValidatedP2WDAAddress
```

Performs a comprehensive P2WDA address validation with three levels of certainty:
1. **isValid** -- the base address is structurally valid.
2. **isPotentiallyP2WDA** -- the address is a P2WSH (could be P2WDA).
3. **isDefinitelyP2WDA** -- the witness script matches the P2WDA pattern AND produces the given address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | `string` | Yes | The address to validate. |
| `network` | `Network` | Yes | The Bitcoin network. |
| `witnessScript` | `Uint8Array` | No | Optional witness script for definitive validation. |

**Returns:** `ValidatedP2WDAAddress`

```typescript
// Without witness script - can only determine if it's potentially P2WDA
const result1 = AddressVerificator.validateP2WDAAddress('bc1q...', networks.bitcoin);
console.log(result1.isPotentiallyP2WDA); // true if P2WSH

// With witness script - can definitively confirm P2WDA
const result2 = AddressVerificator.validateP2WDAAddress('bc1q...', networks.bitcoin, witnessScript);
console.log(result2.isDefinitelyP2WDA); // true if confirmed P2WDA
console.log(result2.publicKey);         // Uint8Array if public key extracted
```

## Address Type Detection

### detectAddressType()

```typescript
static detectAddressType(addy: string, network: Network): AddressTypes | null
```

Detects the type of a Bitcoin address string. Returns `null` if the address type cannot be determined.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `addy` | `string` | Yes | The address or public key string. |
| `network` | `Network` | Yes | The Bitcoin network. |

**Returns:** `AddressTypes | null`

Detection order:
1. Checks if input is a valid public key (`P2PK`).
2. Attempts base58 decode for `P2PKH` or `P2SH_OR_P2SH_P2WPKH`.
3. Attempts bech32 decode for `P2OP`, `P2WPKH`, `P2WSH`, or `P2TR`.

```typescript
const type = AddressVerificator.detectAddressType('bc1p...', networks.bitcoin);
console.log(type); // AddressTypes.P2TR

const type2 = AddressVerificator.detectAddressType('1A1zP1...', networks.bitcoin);
console.log(type2); // AddressTypes.P2PKH

const type3 = AddressVerificator.detectAddressType('bc1q...short', networks.bitcoin);
console.log(type3); // AddressTypes.P2WPKH (if 20-byte program) or P2WSH (if 32-byte)
```

### detectAddressTypeWithWitnessScript()

```typescript
static detectAddressTypeWithWitnessScript(
    addy: string,
    network: Network,
    witnessScript?: Uint8Array,
): AddressTypes | null
```

Enhanced address type detection that can distinguish P2WDA from regular P2WSH when a witness script is provided.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `addy` | `string` | Yes | The address string. |
| `network` | `Network` | Yes | The Bitcoin network. |
| `witnessScript` | `Uint8Array` | No | Optional witness script for P2WDA detection. |

**Returns:** `AddressTypes | null`

If the base type is `P2WSH` and a witness script is provided that matches the P2WDA pattern, returns `AddressTypes.P2WDA` instead of `AddressTypes.P2WSH`.

```typescript
// Without witness script, P2WDA addresses show as P2WSH
const type1 = AddressVerificator.detectAddressTypeWithWitnessScript(
    'bc1q...',
    networks.bitcoin,
);
console.log(type1); // AddressTypes.P2WSH

// With witness script, P2WDA is correctly identified
const type2 = AddressVerificator.detectAddressTypeWithWitnessScript(
    'bc1q...',
    networks.bitcoin,
    p2wdaWitnessScript,
);
console.log(type2); // AddressTypes.P2WDA
```

## Code Examples

### Validating user input

```typescript
import { AddressVerificator, AddressTypes } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

function validateUserAddress(input: string): string {
    const network = networks.bitcoin;
    const type = AddressVerificator.detectAddressType(input, network);

    if (type === null) {
        throw new Error('Unrecognized address format');
    }

    switch (type) {
        case AddressTypes.P2TR:
            return `Valid Taproot address: ${input}`;
        case AddressTypes.P2WPKH:
            return `Valid native SegWit address: ${input}`;
        case AddressTypes.P2PKH:
            return `Valid legacy address: ${input}`;
        case AddressTypes.P2SH_OR_P2SH_P2WPKH:
            return `Valid P2SH or nested SegWit address: ${input}`;
        case AddressTypes.P2WSH:
            return `Valid P2WSH address: ${input}`;
        case AddressTypes.P2OP:
            return `Valid OPNet address: ${input}`;
        case AddressTypes.P2PK:
            return `Valid public key (P2PK): ${input}`;
        default:
            throw new Error(`Unsupported address type: ${type}`);
    }
}
```

### Checking all address types in a batch

```typescript
const addresses = ['bc1p...', 'bc1q...', '1A1z...', '3J98...'];

for (const addr of addresses) {
    const isP2TR   = AddressVerificator.isValidP2TRAddress(addr, networks.bitcoin);
    const isP2WPKH = AddressVerificator.isP2WPKHAddress(addr, networks.bitcoin);
    const isLegacy = AddressVerificator.isP2PKHOrP2SH(addr, networks.bitcoin);

    console.log(`${addr}: P2TR=${isP2TR}, P2WPKH=${isP2WPKH}, Legacy=${isLegacy}`);
}
```

### Validating ML-DSA public keys

```typescript
import { MLDSASecurityLevel } from '@btc-vision/bip32';

const level = AddressVerificator.isValidMLDSAPublicKey(somePublicKeyHex);
if (level === MLDSASecurityLevel.LEVEL2) {
    console.log('ML-DSA-44 public key (1312 bytes)');
} else if (level === MLDSASecurityLevel.LEVEL3) {
    console.log('ML-DSA-65 public key (1952 bytes)');
} else if (level === MLDSASecurityLevel.LEVEL5) {
    console.log('ML-DSA-87 public key (2592 bytes)');
} else {
    console.log('Not a valid ML-DSA public key');
}
```

## Best Practices

1. **Always validate addresses before using them** in transactions. Sending funds to an invalid address results in permanent loss.
2. **Use `detectAddressType()` for routing logic** instead of string-prefix heuristics, which can fail across networks.
3. **Provide the witness script when validating P2WDA** to get definitive confirmation rather than just potential P2WDA status.
4. **Validate public keys with `isValidPublicKey()`** before passing them to `Address.fromString()` or multi-sig construction.
5. **Check the network parameter** carefully. An address valid on mainnet may not be valid on testnet and vice versa.

## Related Documentation

- [Address](./address.md) -- Quantum-resistant address representation
- [EcKeyPair](./ec-keypair.md) -- Classical ECDSA/Schnorr key pair utilities
- [Wallet](./wallet.md) -- Manages both classical and quantum-resistant keys
- [P2WDA Addresses](../addresses/P2WDA.md) -- Pay-to-Witness-Data-Authentication
