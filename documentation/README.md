# @btc-vision/transaction

**The OPNet Transaction Library** -- Build, sign, and broadcast Bitcoin transactions with quantum-resistant cryptography support. Create funding transfers, deploy smart contracts, call contract functions, handle multi-signature flows, and manage offline signing -- all with a unified TypeScript API that works in both Node.js and the browser.

---

## Quick Start

```bash
npm install @btc-vision/transaction @btc-vision/bitcoin
```

```typescript
import { Mnemonic, TransactionFactory, networks } from '@btc-vision/transaction';

// 1. Generate a quantum-resistant wallet from a mnemonic
const mnemonic = Mnemonic.generate();
const wallet = mnemonic.derive(0);

console.log('Taproot address:', wallet.p2tr);
console.log('SegWit address:', wallet.p2wpkh);

// 2. Create a BTC transfer
const factory = new TransactionFactory();

const transfer = await factory.createBTCTransfer({
    from: wallet.p2tr,
    to: 'bc1q...',
    utxos: myUtxos,
    signer: wallet.keypair,
    network: networks.bitcoin,
    feeRate: 10,
    amount: 50_000n,
    priorityFee: 0n,
});

console.log('Signed transaction hex:', transfer.tx);
console.log('Estimated fees:', transfer.estimatedFees);

// 3. Broadcast via OPNetLimitedProvider or any RPC
```

---

## Table of Contents

### [Getting Started](#getting-started-1)

- [Installation](./getting-started/installation.md) -- npm, TypeScript config, peer deps, browser/node setup
- [Overview](./getting-started/overview.md) -- Architecture, key concepts, two-transaction model
- [Quick Start](./getting-started/quick-start.md) -- First wallet, first transfer, first contract interaction

### [Transaction Building](#transaction-building-1)

- [TransactionFactory](./transaction-building/transaction-factory.md) -- Main entry point, all factory methods
- [TransactionFactory Interfaces](./transaction-building/transaction-factory-interfaces.md) -- All parameter interfaces (`IFundingTransactionParameters`, `IDeploymentParameters`, `IInteractionParameters`, etc.)
- [Funding Transactions](./transaction-building/funding-transactions.md) -- BTC transfers, split outputs, auto-adjust
- [Deployment Transactions](./transaction-building/deployment-transactions.md) -- Contract deployment, bytecode, constructor calldata
- [Interaction Transactions](./transaction-building/interaction-transactions.md) -- Contract function calls, access lists
- [MultiSig Transactions](./transaction-building/multisig-transactions.md) -- M-of-N multi-signature
- [Custom Script Transactions](./transaction-building/custom-script-transactions.md) -- Arbitrary Bitcoin scripts
- [Cancel Transactions](./transaction-building/cancel-transactions.md) -- Recover stuck transactions
- [Consolidated Transactions](./transaction-building/consolidated-transactions.md) -- Two-phase commitment-based interactions

### [Key Pair & Wallet Management](#key-pair--wallet-management-1)

- [Address](./keypair/address.md) -- Quantum-resistant address, P2TR/P2MR/P2WPKH/P2PKH/P2WDA, `fromString()`
- [EcKeyPair](./keypair/ec-keypair.md) -- Classical key pairs, WIF, Taproot addresses
- [Wallet](./keypair/wallet.md) -- Unified classical + quantum wallet, disposable
- [MessageSigner](./keypair/message-signer.md) -- Message signing (Auto methods, browser/backend detection, ML-DSA, Schnorr, tweaked)
- [AddressVerificator](./keypair/address-verificator.md) -- Address validation, type detection

### [Mnemonic & HD Derivation](#mnemonic--hd-derivation-1)

- [Mnemonic](./keypair/mnemonic.md) -- BIP39 phrases, BIP360 quantum derivation, wallet generation

### [Binary Serialization](#binary-serialization-1)

- [BinaryWriter](./binary/binary-writer.md) -- Write primitives, arrays, maps, addresses
- [BinaryReader](./binary/binary-reader.md) -- Read primitives, arrays, maps, addresses

### [ABI Encoding](#abi-encoding-1)

- [ABICoder](./abi/abi-coder.md) -- ABI data types, encoding/decoding, selectors

### [Address Types](#address-types-1)

- [P2OP](./addresses/P2OP.md) -- Pay-to-OPNet contract addresses
- [P2WDA](./addresses/P2WDA.md) -- Pay-to-Witness-Data-Authentication
- [Address Types Overview](./addresses/address-types.md) -- All supported Bitcoin address types (including P2MR)

### [Signer Utilities](#signer-utilities-1)

- [TweakedSigner](./signer/tweaked-signer.md) -- Taproot key tweaking
- [Address Rotation](./signer/address-rotation.md) -- Per-UTXO signing with different keys
- [Parallel Signer](./signer/parallel-signer.md) -- Parallel signing adapters

### [Offline Transactions](#offline-transactions-1)

- [Offline Transaction Signing](./offline/offline-transaction-signing.md) -- Export, import, reconstruct, air-gapped signing

### [UTXO Management](#utxo-management-1)

- [OPNetLimitedProvider](./utxo/opnet-limited-provider.md) -- Fetch UTXOs, broadcast transactions

### [Browser Integration](#browser-integration-1)

- [Web3Provider](./browser/web3-provider.md) -- Generic browser wallet provider
- [Wallet Extensions](./browser/wallet-extensions.md) -- Unisat, Xverse integration

### [Epoch & Challenges](#epoch--challenges-1)

- [ChallengeSolution](./epoch/challenge-solution.md) -- Epoch challenge solutions
- [EpochValidator](./epoch/epoch-validator.md) -- Epoch validation and proof verification

### [Deterministic Collections](#deterministic-collections-1)

- [Deterministic Collections](./deterministic/deterministic-collections.md) -- AddressMap, AddressSet, ExtendedAddressMap, DeterministicMap, FastMap

### [Script Generators](#script-generators-1)

- [Generators](./generators/generators.md) -- Deployment, calldata, custom, multi-sig, P2WDA generators

### [Quantum Support (ML-DSA)](#quantum-support-ml-dsa-1)

- [Complete Quantum Support Guide](./quantum-support/README.md) with sub-pages:
  - [Introduction](./quantum-support/01-introduction.md) -- What is ML-DSA, security levels, hybrid architecture
  - [Mnemonic & Wallet](./quantum-support/02-mnemonic-and-wallet.md) -- BIP39 + BIP360 quantum key derivation
  - [Address Generation](./quantum-support/03-address-generation.md) -- P2OP, P2WDA, classical address types
  - [Message Signing](./quantum-support/04-message-signing.md) -- ML-DSA and Schnorr signatures, tweaked signing
  - [Address Verification](./quantum-support/05-address-verification.md) -- Validate ML-DSA public keys, detect address types

### [Utilities](#utilities-1)

- [BitcoinUtils](./utils/bitcoin-utils.md) -- Satoshi conversion, random bytes, hex validation
- [BufferHelper](./utils/buffer-helper.md) -- Hex conversion, bigint/Uint8Array conversion
- [Compressor](./utils/compressor.md) -- Bytecode compression/decompression
- [Types & Constants](./utils/types-and-constants.md) -- Type aliases (`u8`, `u16`, etc.), byte length constants

### [API Reference](#api-reference-1)

- [Transaction Types](./api-reference/transaction-types.md) -- `TransactionType` enum, `ChainId`, `Features`
- [Interfaces](./api-reference/interfaces.md) -- All TypeScript interfaces
- [Response Types](./api-reference/response-types.md) -- `BitcoinTransferResponse`, `DeploymentResult`, `InteractionResponse`

---

## Getting Started

Install the library and its peer dependency:

```bash
npm install @btc-vision/transaction @btc-vision/bitcoin
```

The library ships with separate entry points for **Node.js** and **browser** environments. Conditional exports in `package.json` resolve the correct build automatically. For detailed setup instructions (TypeScript config, bundler configuration, polyfills), see the [Installation](./getting-started/installation.md) guide.

Start with the [Overview](./getting-started/overview.md) to understand the architecture, then follow the [Quick Start](./getting-started/quick-start.md) tutorial.

---

## Transaction Building

The [`TransactionFactory`](./transaction-building/transaction-factory.md) is the primary entry point for creating every type of transaction. It handles UTXO selection, fee estimation, funding transaction generation, and signing.

| Method | Description | Guide |
|--------|-------------|-------|
| `createBTCTransfer()` | Send BTC between addresses | [Funding Transactions](./transaction-building/funding-transactions.md) |
| `signDeployment()` | Deploy a smart contract | [Deployment Transactions](./transaction-building/deployment-transactions.md) |
| `signInteraction()` | Call a contract function | [Interaction Transactions](./transaction-building/interaction-transactions.md) |
| `signConsolidatedInteraction()` | Two-phase commitment interaction | [Consolidated Transactions](./transaction-building/consolidated-transactions.md) |
| `createCustomScriptTransaction()` | Arbitrary Bitcoin scripts | [Custom Script Transactions](./transaction-building/custom-script-transactions.md) |
| `createCancellableTransaction()` | Cancel a stuck transaction | [Cancel Transactions](./transaction-building/cancel-transactions.md) |

All parameter interfaces are documented in [TransactionFactory Interfaces](./transaction-building/transaction-factory-interfaces.md).

---

## Key Pair & Wallet Management

OPNet uses a **hybrid classical + quantum** key model. Every wallet contains both an secp256k1 key pair (for Taproot/SegWit) and an ML-DSA key pair (for quantum resistance).

- **[Address](./keypair/address.md)** -- The universal `Address` class wrapping a quantum-resistant public key hash.
- **[EcKeyPair](./keypair/ec-keypair.md)** -- Create classical key pairs from WIF strings, private key hex, or random generation.
- **[Wallet](./keypair/wallet.md)** -- Unified wallet combining classical and quantum keys with address derivation for all formats.
- **[MessageSigner](./keypair/message-signer.md)** -- Sign and verify messages with automatic backend/browser detection.
- **[AddressVerificator](./keypair/address-verificator.md)** -- Validate addresses and detect their type (P2TR, P2MR, P2WPKH, P2PKH, P2WDA, P2OP).

---

## Mnemonic & HD Derivation

The [Mnemonic](./keypair/mnemonic.md) class generates and manages BIP39 mnemonic phrases with BIP360 quantum key derivation. Derive multiple wallets from a single seed phrase with full quantum support.

```typescript
import { Mnemonic } from '@btc-vision/transaction';

const mnemonic = Mnemonic.generate();
console.log('Seed phrase:', mnemonic.phrase);

const wallet0 = mnemonic.derive(0);
const wallet1 = mnemonic.derive(1);
```

---

## Binary Serialization

Read and write binary data for contract calldata, event decoding, and low-level protocol interactions.

- **[BinaryWriter](./binary/binary-writer.md)** -- Serialize primitives (`u8`, `u16`, `u32`, `u64`, `u256`), strings, arrays, maps, and `Address` values.
- **[BinaryReader](./binary/binary-reader.md)** -- Deserialize the same types from binary data returned by contracts or events.

---

## ABI Encoding

The [ABICoder](./abi/abi-coder.md) provides Ethereum-style ABI encoding and decoding for OPNet smart contracts. Encode function selectors, parameters, and decode return values.

---

## Address Types

OPNet supports multiple Bitcoin address formats:

- **[P2OP](./addresses/P2OP.md)** -- Pay-to-OPNet, witness v16 addresses used for smart contracts.
- **[P2WDA](./addresses/P2WDA.md)** -- Pay-to-Witness-Data-Authentication, quantum-authenticated witness addresses.
- **[Address Types Overview](./addresses/address-types.md)** -- Complete reference for P2TR, P2MR, P2WPKH, P2PKH, P2SH, and OPNet-specific types.

---

## Signer Utilities

Advanced signing utilities for Taproot, UTXO rotation, and parallel signing:

- **[TweakedSigner](./signer/tweaked-signer.md)** -- Tweak key pairs for Taproot key-path spending.
- **[Address Rotation](./signer/address-rotation.md)** -- Sign individual UTXOs with different key pairs.
- **[Parallel Signer](./signer/parallel-signer.md)** -- Adapter for signing multiple inputs in parallel.

---

## Offline Transactions

The [Offline Transaction Signing](./offline/offline-transaction-signing.md) system lets you export partially-signed transactions, transfer them to an air-gapped machine, sign them offline, and import the signed result for broadcast. Supports RBF fee bumping and multi-signature workflows.

---

## UTXO Management

The [OPNetLimitedProvider](./utxo/opnet-limited-provider.md) fetches UTXOs from an OPNet node and broadcasts signed transactions. It is the default provider used by `TransactionFactory`.

---

## Browser Integration

Use OPNet transactions directly in the browser with wallet extension support:

- **[Web3Provider](./browser/web3-provider.md)** -- Generic provider interface for browser wallets.
- **[Wallet Extensions](./browser/wallet-extensions.md)** -- Built-in adapters for **Unisat** and **Xverse** wallet extensions.

---

## Epoch & Challenges

Epoch-based challenge/response system for network validation:

- **[ChallengeSolution](./epoch/challenge-solution.md)** -- Construct and submit epoch challenge solutions.
- **[EpochValidator](./epoch/epoch-validator.md)** -- Validate epochs and verify proofs.

---

## Deterministic Collections

The [Deterministic Collections](./deterministic/deterministic-collections.md) module provides map and set implementations with deterministic iteration order, essential for consensus-critical code:

- `AddressMap` / `AddressSet` -- Keyed by `Address` with deterministic ordering.
- `ExtendedAddressMap` -- Extended address-keyed map with additional lookup methods.
- `DeterministicMap` -- Generic deterministic-order map.
- `FastMap` -- High-performance map for non-consensus contexts.

---

## Script Generators

The [Generators](./generators/generators.md) module contains low-level script builders used internally by `TransactionFactory`:

- `DeploymentGenerator` -- Build deployment witness scripts.
- `CalldataGenerator` -- Build interaction calldata scripts.
- `CustomGenerator` -- Build arbitrary witness scripts.
- `MultiSignGenerator` -- Build multi-signature scripts.
- `P2WDAGenerator` -- Build P2WDA witness scripts.

---

## Quantum Support (ML-DSA)

OPNet implements **ML-DSA** (Module-Lattice-Based Digital Signature Algorithm) for post-quantum cryptography. The hybrid architecture pairs classical secp256k1 keys with ML-DSA keys so that transactions are secure against both classical and quantum attacks. Additionally, **P2MR (Pay-to-Merkle-Root, BIP 360)** provides quantum-safe transaction outputs by committing directly to a Merkle root without a key-path spend.

See the [Complete Quantum Support Guide](./quantum-support/README.md) for a full walkthrough, or jump to a specific topic:

1. [Introduction](./quantum-support/01-introduction.md) -- ML-DSA overview, security levels (LEVEL2, LEVEL3, LEVEL5)
2. [Mnemonic & Wallet](./quantum-support/02-mnemonic-and-wallet.md) -- BIP39 + BIP360 derivation
3. [Address Generation](./quantum-support/03-address-generation.md) -- All address formats
4. [Message Signing](./quantum-support/04-message-signing.md) -- ML-DSA and Schnorr signatures
5. [Address Verification](./quantum-support/05-address-verification.md) -- Public key validation

---

## Utilities

Helper modules used throughout the library:

- **[BitcoinUtils](./utils/bitcoin-utils.md)** -- Convert between BTC and satoshis, generate random bytes, validate hex strings.
- **[BufferHelper](./utils/buffer-helper.md)** -- Convert between hex strings, `bigint`, and `Uint8Array`.
- **[Compressor](./utils/compressor.md)** -- Compress and decompress contract bytecode with pako/zlib.
- **[Types & Constants](./utils/types-and-constants.md)** -- Type aliases (`u8`, `u16`, `u32`, `u64`, `u128`, `u256`), byte length constants, and shared type definitions.

---

## API Reference

Complete TypeScript API reference:

- **[Transaction Types](./api-reference/transaction-types.md)** -- `TransactionType` enum, `ChainId` enum, `Features` flags.
- **[Interfaces](./api-reference/interfaces.md)** -- All TypeScript interfaces used across the library.
- **[Response Types](./api-reference/response-types.md)** -- `BitcoinTransferResponse`, `DeploymentResult`, `InteractionResponse`, `ConsolidatedInteractionResponse`, and more.

---

## License

This project is licensed under the [Apache-2.0 License](../LICENSE).
