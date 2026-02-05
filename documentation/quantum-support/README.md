# OPNet ML-DSA Quantum Support Documentation

Welcome to the OPNet ML-DSA (Post-Quantum Cryptography) documentation! This guide will help you integrate quantum-resistant signatures and addresses into your OPNet applications.

## Documentation Index

### [1. Introduction to ML-DSA](./01-introduction.md)
Learn about ML-DSA (Module-Lattice-Based Digital Signature Algorithm), the hybrid quantum-classical architecture, and when to use quantum-resistant cryptography.

**Topics covered:**
- What is ML-DSA and post-quantum cryptography
- Three security levels: **LEVEL2 (BIP360 RECOMMENDED DEFAULT)**, LEVEL3, LEVEL5
- Hybrid classical + quantum architecture
- Quick start guide
- When to use ML-DSA vs classical crypto

### [2. Mnemonic & Wallet Management](./02-mnemonic-and-wallet.md)
Complete guide to generating and managing quantum-resistant wallets using BIP39 mnemonics and BIP360 quantum key derivation.

**Topics covered:**
- Generating new mnemonics with quantum support
- Loading existing mnemonics
- Deriving wallets (single and multiple)
- Wallet properties (classical and quantum keys)
- Security best practices
- Network awareness
- Advanced usage

### [3. Address Generation](./03-address-generation.md)
Learn to generate P2OP and classical Bitcoin addresses for all networks.

**Topics covered:**
- P2OP addresses (Pay-to-OPNet, for contract addresses)
- Classical addresses (P2TR, P2WPKH, P2PKH, P2SH)
- P2WDA (Witness Data Authentication)
- Network support (mainnet, testnet, regtest)
- Address comparison and ordering
- Time-locked addresses (CSV)
- Address caching

### [4. Message Signing](./04-message-signing.md)
Sign and verify messages using ML-DSA (quantum) and Schnorr (classical) signatures. Includes detailed explanation of `QuantumBIP32Factory.fromPublicKey()` usage for signature verification.

**Topics covered:**
- ML-DSA message signing and verification
- Schnorr message signing
- Multiple input formats (string, Uint8Array, hex)
- Cross-format verification
- Tweaked signatures for Taproot
- Message hashing (SHA-256)
- Best practices

### [5. Address Verification](./05-address-verification.md)
Validate ML-DSA public keys and detect classical address types.

**Topics covered:**
- ML-DSA public key validation
- Address type detection
- Classical address validation
- Network-specific validation
- Complete validation examples

---

**Ready to get started?** Begin with the [Introduction](./01-introduction.md)!
