# Address Generation Guide

## Table of Contents
- [Address Types Overview](#address-types-overview)
- [P2OP Addresses](#p2op-addresses)
- [Classical Addresses](#classical-addresses)
- [Address Class Usage](#address-class-usage)
- [Network Support](#network-support)
- [Address Comparison](#address-comparison)

## Address Types Overview

OPNet supports multiple address types for different use cases:

| Address Type | Format | Use Case | Quantum Support |
|-------------|--------|----------|----------------|
| **P2OP** | bc1s... (v16) | OPNet contract addresses | ✅ Quantum (contracts only) |
| **P2QRH** | TBD | Quantum-resistant user addresses | ✅ Quantum (NOT IMPLEMENTED) |
| **P2TR** | bc1p... (v1) | Taproot, privacy, efficiency | ❌ Classical |
| **P2WPKH** | bc1q... (v0) | SegWit, standard Bitcoin | ❌ Classical |
| **P2PKH** | 1... | Legacy Bitcoin | ❌ Classical |
| **P2SH** | 3... | Script hash, multi-sig | ❌ Classical |
| **P2WDA** | bc1q... (P2WSH) | Witness data authentication | ❌ Classical |

## P2OP Addresses

### What is P2OP?

**P2OP (Pay-to-OPNet)** is an address format for OPNet contract addresses:

- Uses **witness version 16** (OP_16)
- Encoded in **Bech32m format**
- Encodes the **quantum address** (SHA256 hash of ML-DSA public key) from `address.toHex()`
- Used exclusively for contract addresses on OPNet
- **Supports quantum** for contracts only

The quantum address (`address.toHex()`) is the user's universal public key - a 32-byte hash that can be encoded in various formats like P2OP.

> **Note:** For quantum-resistant user addresses, **P2QRH** (Pay-to-Quantum-Resistant-Hash) will be implemented in the future. P2OP currently only supports quantum for contract addresses.

## Classical Addresses

### P2TR (Taproot)

```typescript
const wallet = mnemonic.derive(0);

// Mainnet Taproot
const p2trMainnet = wallet.p2tr;
console.log('P2TR Mainnet:', p2trMainnet);
// Output: bc1p...

// Testnet Taproot
const p2trTestnet = wallet.address.p2tr(networks.testnet);
console.log('P2TR Testnet:', p2trTestnet);
// Output: tb1p...

// Regtest Taproot
const p2trRegtest = wallet.address.p2tr(networks.regtest);
console.log('P2TR Regtest:', p2trRegtest);
// Output: bcrt1p...
```

### P2WPKH (SegWit)

```typescript
// Mainnet SegWit
const p2wpkhMainnet = wallet.p2wpkh;
console.log('P2WPKH Mainnet:', p2wpkhMainnet);
// Output: bc1q...

// Testnet SegWit
const p2wpkhTestnet = wallet.address.p2wpkh(networks.testnet);
console.log('P2WPKH Testnet:', p2wpkhTestnet);
// Output: tb1q...
```

### P2PKH (Legacy)

```typescript
// Mainnet Legacy
const p2pkhMainnet = wallet.p2pkh;
console.log('P2PKH Mainnet:', p2pkhMainnet);
// Output: 1...

// Testnet Legacy
const p2pkhTestnet = wallet.address.p2pkh(networks.testnet);
console.log('P2PKH Testnet:', p2pkhTestnet);
// Output: m... or n...
```

### P2SH-P2WPKH (Wrapped SegWit)

```typescript
// Mainnet Wrapped SegWit
const p2shMainnet = wallet.address.p2shp2wpkh(networks.bitcoin);
console.log('P2SH-P2WPKH Mainnet:', p2shMainnet);
// Output: 3...

// Testnet Wrapped SegWit
const p2shTestnet = wallet.address.p2shp2wpkh(networks.testnet);
console.log('P2SH-P2WPKH Testnet:', p2shTestnet);
// Output: 2...
```

### P2WDA (Witness Data Authentication)

```typescript
// P2WDA with authenticated data fields
const p2wdaAddress = wallet.address.p2wda(networks.bitcoin);
console.log('P2WDA:', p2wdaAddress);
// Output: P2WSH address (bc1q...) with special witness script
```

## Address Class Usage

### Creating Addresses Directly

```typescript
import { Address } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

import { fromHex } from '@btc-vision/bitcoin';

// From ML-DSA public key hash and classical public key
const mldsaHash = new Uint8Array(32).fill(0x01);  // SHA256 of ML-DSA public key
const classicalKey = fromHex('02...');  // 33-byte compressed key

const address = new Address(mldsaHash, classicalKey);

// Generate addresses
const p2op = address.p2op(networks.bitcoin);
const p2tr = address.p2tr(networks.bitcoin);
```

### From String

```typescript
// Create address from hex strings
const address = Address.fromString(
    '0xabcdef1234567890...',  // ML-DSA public key hash (32 bytes hex)
    '0x02...'                  // Classical public key (33 bytes hex)
);
```

### Dead Address

```typescript
// Special "dead" address (all zeros)
const deadAddress = Address.dead();
console.log('Dead address:', deadAddress.toHex());
// Output: 0x0000000000000000000000000000000000000000000000000000000000000000
```

### Address Properties

```typescript
const address = wallet.address;

// Quantum address (SHA256 hash of ML-DSA public key) - Universal public key
console.log('Quantum address:', address.toHex());
console.log('Quantum address bytes:', address.toBuffer());

// Classical public key
console.log('Classical key (hex):', address.tweakedToHex());
console.log('Classical key (bytes):', address.tweakedPublicKeyToBuffer());

// Original keys
console.log('Full ML-DSA public key:', address.mldsaPublicKey);  // 1312-2592 bytes
console.log('Original classical key:', address.originalPublicKey);
```

## Network Support

### Mainnet

```typescript
import { networks } from '@btc-vision/bitcoin';

const wallet = mnemonic.derive(0);

// All mainnet addresses
console.log('P2OP:', wallet.address.p2op(networks.bitcoin));      // bc1s...
console.log('P2TR:', wallet.address.p2tr(networks.bitcoin));      // bc1p...
console.log('P2WPKH:', wallet.address.p2wpkh(networks.bitcoin));  // bc1q...
console.log('P2PKH:', wallet.address.p2pkh(networks.bitcoin));    // 1...
```

### Testnet

```typescript
// Testnet with different prefixes
const mnemonic = Mnemonic.generate(
    undefined,                            // Default strength (24 words)
    '',                                   // No passphrase
    networks.testnet,                     // Testnet network
    MLDSASecurityLevel.LEVEL2            // Security level
);

const wallet = mnemonic.derive(0);

console.log('P2OP:', wallet.address.p2op(networks.testnet));      // tb1s...
console.log('P2TR:', wallet.address.p2tr(networks.testnet));      // tb1p...
console.log('P2WPKH:', wallet.address.p2wpkh(networks.testnet));  // tb1q...
console.log('P2PKH:', wallet.address.p2pkh(networks.testnet));    // m... or n...
```

### Regtest

```typescript
// Regtest for local development
const regtestMnemonic = Mnemonic.generate(
    undefined,                            // Default strength (24 words)
    '',                                   // No passphrase
    networks.regtest,                     // Regtest network
    MLDSASecurityLevel.LEVEL2            // Security level
);

const wallet = regtestMnemonic.derive(0);

console.log('P2OP:', wallet.address.p2op(networks.regtest));      // bcrt1s...
console.log('P2TR:', wallet.address.p2tr(networks.regtest));      // bcrt1p...
```

## Address Comparison

### Equality

```typescript
const wallet1 = mnemonic.derive(0);
const wallet2 = mnemonic.derive(0);
const wallet3 = mnemonic.derive(1);

const addr1 = wallet1.address;
const addr2 = wallet2.address;
const addr3 = wallet3.address;

// Same derivation index = same address
console.log(addr1.equals(addr2));  // true

// Different index = different address
console.log(addr1.equals(addr3));  // false
```

### Ordering

```typescript
const addresses = [
    mnemonic.derive(5).address,
    mnemonic.derive(2).address,
    mnemonic.derive(8).address,
    mnemonic.derive(1).address,
];

// Less than comparison
console.log(addresses[0].lessThan(addresses[1]));

// Greater than comparison
console.log(addresses[0].greaterThan(addresses[1]));

// Sort addresses
addresses.sort((a, b) => {
    if (a.lessThan(b)) return -1;
    if (a.greaterThan(b)) return 1;
    return 0;
});
```

## Time-Locked Addresses (CSV)

### CheckSequenceVerify Addresses

```typescript
// Create time-locked address (100 blocks)
const duration = 100;
const csvAddress = wallet.address.toCSV(duration, networks.bitcoin);

console.log('CSV Address (100 blocks):', csvAddress);

// Different durations
const addr1Day = wallet.address.toCSV(144, networks.bitcoin);    // ~1 day
const addr1Week = wallet.address.toCSV(1008, networks.bitcoin);  // ~1 week
const addr1Month = wallet.address.toCSV(4320, networks.bitcoin); // ~1 month

// Valid range: 1 to 65535 blocks
const minLock = wallet.address.toCSV(1, networks.bitcoin);
const maxLock = wallet.address.toCSV(65535, networks.bitcoin);
```

## Complete Example

```typescript
import { Mnemonic, MLDSASecurityLevel } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// Generate wallet with ML-DSA support
const mnemonic = Mnemonic.generate(
    undefined,                            // Default strength (24 words)
    '',                                   // No passphrase
    networks.bitcoin,                     // Mainnet
    MLDSASecurityLevel.LEVEL2            // Security level
);

const wallet = mnemonic.derive(0);
const address = wallet.address;

console.log('=== Universal Public Key (Quantum Address) ===');
console.log('Quantum Address:', address.toHex());  // SHA256 hash of ML-DSA public key
console.log('ML-DSA Key Size:', address.mldsaPublicKey?.length, 'bytes');

console.log('\n=== P2OP Address (Contract Address) ===');
console.log('P2OP:', address.p2op(networks.bitcoin));  // Encoded form of quantum address

console.log('\n=== Classical Addresses ===');
console.log('P2TR (Taproot):', address.p2tr(networks.bitcoin));
console.log('P2WPKH (SegWit):', address.p2wpkh(networks.bitcoin));
console.log('P2PKH (Legacy):', address.p2pkh(networks.bitcoin));
console.log('P2SH-P2WPKH:', address.p2shp2wpkh(networks.bitcoin));

console.log('\n=== Testnet Addresses ===');
console.log('P2OP:', address.p2op(networks.testnet));
console.log('P2TR:', address.p2tr(networks.testnet));

console.log('\n=== Time-Locked Address ===');
console.log('CSV (100 blocks):', address.toCSV(100, networks.bitcoin));
```

## Next Steps

- [Message Signing](./04-message-signing.md) - Sign messages with ML-DSA and Schnorr
- [Address Verification](./05-address-verification.md) - Validate addresses and keys
