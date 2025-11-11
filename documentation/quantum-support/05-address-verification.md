# Address Verification Guide

## Table of Contents
- [ML-DSA Public Key Validation](#ml-dsa-public-key-validation)
- [Address Type Detection](#address-type-detection)
- [Classical Address Validation](#classical-address-validation)
- [Complete Validation Example](#complete-validation-example)

## ML-DSA Public Key Validation

### Validating ML-DSA Public Keys

The `AddressVerificator` provides methods to validate ML-DSA public keys and determine their security level:

```typescript
import { AddressVerificator, MLDSASecurityLevel } from '@btc-vision/transaction';

// Valid ML-DSA-44 public key (1312 bytes)
const level2Key = Buffer.alloc(1312);
const level2Check = AddressVerificator.isValidMLDSAPublicKey(level2Key);
console.log('LEVEL2 valid:', level2Check);  // MLDSASecurityLevel.LEVEL2

// Valid ML-DSA-65 public key (1952 bytes)
const level3Key = Buffer.alloc(1952);
const level3Check = AddressVerificator.isValidMLDSAPublicKey(level3Key);
console.log('LEVEL3 valid:', level3Check);  // MLDSASecurityLevel.LEVEL3

// Valid ML-DSA-87 public key (2592 bytes)
const level5Key = Buffer.alloc(2592);
const level5Check = AddressVerificator.isValidMLDSAPublicKey(level5Key);
console.log('LEVEL5 valid:', level5Check);  // MLDSASecurityLevel.LEVEL5

// Invalid length
const invalidKey = Buffer.alloc(1000);
const invalidCheck = AddressVerificator.isValidMLDSAPublicKey(invalidKey);
console.log('Invalid:', invalidCheck);  // null
```

### Input Format Support

Validation supports multiple input formats:

```typescript
import { AddressVerificator, MLDSASecurityLevel } from '@btc-vision/transaction';

// Hex string (with 0x prefix)
const hexWith0x = '0x' + 'a'.repeat(2624);  // 1312 bytes in hex
const check1 = AddressVerificator.isValidMLDSAPublicKey(hexWith0x);
console.log('Hex with 0x:', check1);  // MLDSASecurityLevel.LEVEL2

// Hex string (without 0x prefix)
const hexWithout0x = 'a'.repeat(2624);
const check2 = AddressVerificator.isValidMLDSAPublicKey(hexWithout0x);
console.log('Hex without 0x:', check2);  // MLDSASecurityLevel.LEVEL2

// Buffer
const buffer = Buffer.alloc(1312);
const check3 = AddressVerificator.isValidMLDSAPublicKey(buffer);
console.log('Buffer:', check3);  // MLDSASecurityLevel.LEVEL2

// Uint8Array
const uint8Array = new Uint8Array(1312);
const check4 = AddressVerificator.isValidMLDSAPublicKey(uint8Array);
console.log('Uint8Array:', check4);  // MLDSASecurityLevel.LEVEL2
```

### Validating Wallet Keys

```typescript
import { Mnemonic, AddressVerificator, MLDSASecurityLevel } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// Generate wallet
const mnemonic = Mnemonic.generate(undefined, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonic.derive(0);

// Validate quantum public key
const quantumKeyHex = wallet.quantumPublicKeyHex;
const securityLevel = AddressVerificator.isValidMLDSAPublicKey(quantumKeyHex);

console.log('Quantum key valid:', securityLevel !== null);
console.log('Security level:', securityLevel);  // MLDSASecurityLevel.LEVEL2
console.log('Expected:', wallet.securityLevel);  // MLDSASecurityLevel.LEVEL2
console.log('Match:', securityLevel === wallet.securityLevel);  // true
```

### Error Cases

```typescript
// Empty string
console.log(AddressVerificator.isValidMLDSAPublicKey(''));  // null

// Empty Buffer
console.log(AddressVerificator.isValidMLDSAPublicKey(Buffer.alloc(0)));  // null

// Invalid hex
console.log(AddressVerificator.isValidMLDSAPublicKey('not hex'));  // null

// Wrong length (classical key size)
const classicalKey = Buffer.alloc(33);
console.log(AddressVerificator.isValidMLDSAPublicKey(classicalKey));  // null

// Wrong length (arbitrary size)
const wrongSize = Buffer.alloc(1500);
console.log(AddressVerificator.isValidMLDSAPublicKey(wrongSize));  // null
```

## Address Type Detection

### Detecting Address Types

```typescript
import { AddressVerificator, AddressTypes } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const wallet = mnemonic.derive(0);

// P2TR Detection
const p2tr = wallet.p2tr;
const p2trType = AddressVerificator.detectAddressType(p2tr, networks.bitcoin);
console.log('P2TR type:', p2trType);  // AddressTypes.P2TR

// P2WPKH Detection
const p2wpkh = wallet.p2wpkh;
const p2wpkhType = AddressVerificator.detectAddressType(p2wpkh, networks.bitcoin);
console.log('P2WPKH type:', p2wpkhType);  // AddressTypes.P2WPKH

// P2PKH Detection
const p2pkh = wallet.p2pkh;
const p2pkhType = AddressVerificator.detectAddressType(p2pkh, networks.bitcoin);
console.log('P2PKH type:', p2pkhType);  // AddressTypes.P2PKH
```

### Available Address Types

```typescript
enum AddressTypes {
    P2PKH = 'P2PKH',                      // Legacy (1...)
    P2SH_OR_P2SH_P2WPKH = 'P2SH_OR_P2SH-P2WPKH',  // Script hash (3...)
    P2PK = 'P2PK',                        // Public key
    P2TR = 'P2TR',                        // Taproot (bc1p...)
    P2WPKH = 'P2WPKH',                    // SegWit (bc1q...)
    P2WSH = 'P2WSH',                      // SegWit script (bc1q...)
    P2WDA = 'P2WDA',                      // Witness data auth
}
```

### Distinguishing Similar Addresses

```typescript
const wallet = mnemonic.derive(0);

// P2TR vs P2WPKH (both Bech32 formats)
const p2tr = wallet.p2tr;
const p2wpkh = wallet.p2wpkh;

const p2trType = AddressVerificator.detectAddressType(p2tr, networks.bitcoin);
const p2wpkhType = AddressVerificator.detectAddressType(p2wpkh, networks.bitcoin);

console.log('P2TR detected as:', p2trType);  // AddressTypes.P2TR
console.log('P2WPKH detected as:', p2wpkhType);  // AddressTypes.P2WPKH
console.log('Different types:', p2trType !== p2wpkhType);  // true
```

### Network-Specific Detection

```typescript
// Mainnet address on mainnet
const mainnetAddr = wallet.p2tr;
const mainnetDetect = AddressVerificator.detectAddressType(mainnetAddr, networks.bitcoin);
console.log('Mainnet on mainnet:', mainnetDetect);  // AddressTypes.P2TR

// Mainnet address on wrong network
const wrongNetwork = AddressVerificator.detectAddressType(mainnetAddr, networks.testnet);
console.log('Mainnet on testnet:', wrongNetwork);  // null
```

## Classical Address Validation

### Validating Classical Public Keys

```typescript
import { AddressVerificator } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const wallet = mnemonic.derive(0);

// Validate compressed public key (33 bytes)
const compressedKey = wallet.toPublicKeyHex();
const isValid = AddressVerificator.isValidPublicKey(compressedKey, networks.bitcoin);
console.log('Compressed key valid:', isValid);  // true

// Validate uncompressed public key (65 bytes)
const uncompressedKey = wallet.toUncompressedPublicKey().toString('hex');
const isUncompressedValid = AddressVerificator.isValidPublicKey(uncompressedKey, networks.bitcoin);
console.log('Uncompressed key valid:', isUncompressedValid);  // true
```

### Validating Other Address Types

```typescript
// P2TR validation
const p2tr = wallet.p2tr;
const isP2TRValid = AddressVerificator.isValidP2TRAddress(p2tr, networks.bitcoin);
console.log('P2TR valid:', isP2TRValid);  // true

// P2WPKH validation
const p2wpkh = wallet.p2wpkh;
const isP2WPKHValid = AddressVerificator.isP2WPKHAddress(p2wpkh, networks.bitcoin);
console.log('P2WPKH valid:', isP2WPKHValid);  // true

// P2PKH or P2SH validation
const p2pkh = wallet.p2pkh;
const isLegacyValid = AddressVerificator.isP2PKHOrP2SH(p2pkh, networks.bitcoin);
console.log('Legacy valid:', isLegacyValid);  // true
```

## Complete Validation Example

```typescript
import {
    Mnemonic,
    AddressVerificator,
    AddressTypes,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// Generate wallet
const mnemonic = Mnemonic.generate(undefined, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonic.derive(0);

console.log('=== ML-DSA Public Key Validation ===');

// Validate quantum public key
const quantumKeyHex = wallet.quantumPublicKeyHex;
const quantumKeyBuffer = wallet.quantumPublicKey;

const securityLevelFromHex = AddressVerificator.isValidMLDSAPublicKey(quantumKeyHex);
const securityLevelFromBuffer = AddressVerificator.isValidMLDSAPublicKey(quantumKeyBuffer);

console.log('Hex validation:', securityLevelFromHex);  // MLDSASecurityLevel.LEVEL2
console.log('Buffer validation:', securityLevelFromBuffer);  // MLDSASecurityLevel.LEVEL2
console.log('Matches wallet:', securityLevelFromHex === wallet.securityLevel);  // true

console.log('\n=== Address Type Detection ===');

// Detect all address types
const addresses = {
    p2tr: wallet.p2tr,
    p2wpkh: wallet.p2wpkh,
    p2pkh: wallet.p2pkh,
};

for (const [name, addr] of Object.entries(addresses)) {
    const type = AddressVerificator.detectAddressType(addr, networks.bitcoin);
    console.log(`${name}: ${type}`);
}

console.log('\n=== Classical Key Validation ===');

// Validate classical public key
const classicalKey = wallet.toPublicKeyHex();
const isClassicalValid = AddressVerificator.isValidPublicKey(classicalKey, networks.bitcoin);

console.log('Classical key:', classicalKey);
console.log('Classical valid:', isClassicalValid);  // true

console.log('\n=== Cross-Network Validation ===');

// Test network mismatch
const mainnetP2TR = wallet.p2tr;
const testnetMnemonic = Mnemonic.generate(undefined, '', networks.testnet, MLDSASecurityLevel.LEVEL2);
const testnetWallet = testnetMnemonic.derive(0);
const testnetP2TR = testnetWallet.p2tr;

const mainnetType = AddressVerificator.detectAddressType(mainnetP2TR, networks.bitcoin);
const wrongNetworkType = AddressVerificator.detectAddressType(mainnetP2TR, networks.testnet);

console.log('Mainnet P2TR on mainnet:', mainnetType);  // AddressTypes.P2TR
console.log('Mainnet P2TR on testnet:', wrongNetworkType);  // null

console.log('\n=== Complete Wallet Validation ===');

function validateWallet(wallet: any, network: any): boolean {
    // Validate quantum key
    const quantumValid = AddressVerificator.isValidMLDSAPublicKey(
        wallet.quantumPublicKey
    ) !== null;

    // Validate classical key
    const classicalValid = AddressVerificator.isValidPublicKey(
        wallet.toPublicKeyHex(),
        network
    );

    return quantumValid && classicalValid;
}

const isWalletValid = validateWallet(wallet, networks.bitcoin);
console.log('Complete wallet validation:', isWalletValid);  // true
```

## Next Steps

- [Message Signing](./04-message-signing.md) - Sign and verify messages
- [Introduction](./01-introduction.md) - Back to overview
