# ML-DSA Quantum Support - Introduction

## Overview

OPNet now supports **ML-DSA (Module-Lattice-Based Digital Signature Algorithm)**, also known as FIPS 204, providing quantum-resistant cryptography alongside traditional ECDSA/Schnorr signatures. This hybrid approach ensures your transactions and signatures remain secure even when quantum computers become capable of breaking classical cryptographic schemes.

## What is ML-DSA?

ML-DSA is a **post-quantum cryptographic algorithm** standardized by NIST as FIPS 204. It uses lattice-based mathematics that are believed to be resistant to attacks by both classical and quantum computers.

## Security Levels

ML-DSA offers three security levels with different key sizes and security guarantees:

| Level | Name | Public Key Size | Signature Size | Security Equivalent | Status |
|-------|------|----------------|----------------|-------------------|--------|
| **LEVEL2** | ML-DSA-44 | 1,312 bytes | 2,420 bytes | AES-128 | ✅ **RECOMMENDED DEFAULT (BIP360)** |
| **LEVEL3** | ML-DSA-65 | 1,952 bytes | 3,309 bytes | AES-192 | Optional |
| **LEVEL5** | ML-DSA-87 | 2,592 bytes | 4,627 bytes | AES-256 | Optional (maximum security) |

**Recommendation**: Use **LEVEL2** (ML-DSA-44) - this is the **BIP360 default** and provides strong quantum resistance with reasonable key sizes. Use LEVEL3 or LEVEL5 only if you need higher security for specific high-value applications.

## Hybrid Architecture

OPNet uses a **dual-key system** for maximum compatibility and security:

```
┌─────────────────────────────────────────────────────────┐
│                    OPNet Wallet                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Classical Keys (ECDSA/Schnorr)    Quantum Keys (ML-DSA)│
│  ├─ 32-byte private key            ├─ Private key       │
│  ├─ 33-byte public key              ├─ 1312-2592 byte   │
│  ├─ Bitcoin script execution        │   public key      │
│  └─ P2TR, P2WPKH addresses          └─ Quantum address  │
│                                                         │
│  SHA256 Hash of ML-DSA Public Key → Universal Public Key│
│         (address.toHex() - 32 bytes)                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### How It Works

1. **Universal Public Key**: ML-DSA public keys are **SHA256-hashed to 32 bytes** via `address.toHex()` - this is the user's universal identifier
2. **Classical Keys**: Maintained separately for Bitcoin transaction signing (P2TR, P2WPKH, etc.)
3. **Quantum Keys**: Provide quantum-resistant authentication and signatures
4. **P2OP Addresses**: Contract address format (witness version 16) - for OPNet contracts ONLY, not for user addresses

## Quick Start

```typescript
import { Mnemonic, MessageSigner, MLDSASecurityLevel } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// Generate a new quantum-resistant wallet
const mnemonic = Mnemonic.generate(undefined, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);

// Derive a wallet
const wallet = mnemonic.derive(0);

// Get quantum address (universal public key)
const quantumAddress = wallet.address.toHex();
console.log('Quantum Address:', quantumAddress);

// Sign a message with ML-DSA
const message = 'Hello, Quantum World!';
const signature = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);
console.log('ML-DSA Signature:', Buffer.from(signature.signature).toString('hex'));
```

## What's New

This implementation adds:

1. **Mnemonic Support** - BIP39 + BIP360 for quantum key derivation
2. **Wallet Management** - Hybrid classical + quantum key management
3. **Universal Public Key** - `address.toHex()` provides the user's quantum address (SHA256 of ML-DSA public key)
4. **Message Signing** - ML-DSA and Schnorr signature support
5. **Address Verification** - Validation for ML-DSA public keys and classical address types
6. **Security Levels** - Three levels of quantum resistance (LEVEL2, LEVEL3, LEVEL5)

## Next Steps

- [Mnemonic & Wallet Guide](./02-mnemonic-and-wallet.md) - Learn to generate and manage quantum wallets
- [Address Generation](./03-address-generation.md) - Generate P2OP and other addresses
- [Message Signing](./04-message-signing.md) - Sign and verify messages
