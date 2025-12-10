# OPNet Transaction Library Documentation

Complete documentation for the OPNet Transaction Library - Bitcoin transaction building with quantum-resistant cryptography support.

## Documentation Index

### Core Concepts

#### Address Types
- **[P2OP](./addresses/P2OP.md)** - Pay-to-OPNet contract addresses (witness v16, quantum support for contracts only)
- **P2QRH** - Pay-to-Quantum-Resistant-Hash user addresses (NOT IMPLEMENTED)
- **P2WDA** - Pay-to-Witness-Data-Authentication addresses
- **P2TR** - Pay-to-Taproot addresses (witness v1)
- **P2WPKH** - Pay-to-Witness-PubKey-Hash (SegWit v0)
- **P2PKH** - Pay-to-PubKey-Hash (legacy)
- **P2SH** - Pay-to-Script-Hash

#### Quantum Address
- **Universal Public Key** - `address.toHex()` returns the SHA256 hash of ML-DSA public key (32 bytes)
- This is the user's universal identifier across the OPNet protocol

### Transaction Building

- **[Offline Transaction Signing](./offline-transaction-signing.md)** - Serialize transactions for offline/air-gapped signing, fee bumping (RBF), address rotation, and MultiSig support

### Quantum Support (ML-DSA)

**[Complete Quantum Support Guide](./quantum-support/README.md)**

- [Introduction to ML-DSA](./quantum-support/01-introduction.md) - Post-quantum cryptography overview
- [Mnemonic & Wallet Management](./quantum-support/02-mnemonic-and-wallet.md) - BIP39 + BIP360 quantum wallets
- [Address Generation](./quantum-support/03-address-generation.md) - All address types
- [Message Signing](./quantum-support/04-message-signing.md) - ML-DSA and Schnorr signatures
- [Address Verification](./quantum-support/05-address-verification.md) - Validation and type detection
- [Complete Examples](./quantum-support/06-complete-examples.md) - Production-ready code
- [Complete Message Signing Example](./quantum-support/complete-message-signing-example.md) - Full working example with proper typings
