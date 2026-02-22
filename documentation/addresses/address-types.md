# Address Types Overview

Complete reference for all Bitcoin address types supported by the `@btc-vision/transaction` library.

---

## Navigation

- [Back to Documentation](../README.md#address-types-1)
- [P2OP Addresses](./P2OP.md)
- [P2WDA Addresses](./P2WDA.md)

---

## Supported Address Types

| Type | Prefix (Mainnet) | Witness Version | Weight Efficiency | Support | Description |
|------|-------------------|-----------------|-------------------|---------|-------------|
| P2PKH | `1...` | N/A (legacy) | 1x | Full | Pay-to-Public-Key-Hash |
| P2SH | `3...` | N/A (legacy) | 1x | Full | Pay-to-Script-Hash |
| P2WPKH | `bc1q...` (42 chars) | v0 | ~0.68x | Full | Pay-to-Witness-Public-Key-Hash |
| P2WSH | `bc1q...` (62 chars) | v0 | ~0.68x | Full | Pay-to-Witness-Script-Hash |
| P2TR | `bc1p...` | v1 | ~0.57x | Full | Pay-to-Taproot |
| P2MR | `bc1z...` | v2 | ~0.57x | Full | Pay-to-Merkle-Root (BIP 360) |
| P2OP | `bc1s...` / `bcrt1s...` | v16 | N/A | Contracts only | Pay-to-OPNet |
| P2WDA | `bc1q...` (P2WSH) | v0 | N/A | Data witness | Pay-to-Witness-Data-Authentication |
| P2A | Anchor output | N/A | Minimal | Full | Pay-to-Anchor (CPFP) |
| P2PK | Raw public key | N/A | N/A | Limited | Pay-to-Public-Key |

> **Weight Efficiency** indicates the relative cost compared to legacy P2PKH. Lower is cheaper. SegWit v0 benefits from the witness discount (1 weight unit instead of 4 for witness data). Taproot (v1) benefits further from key-path spending optimizations.

---

## P2PKH -- Pay-to-Public-Key-Hash

The original Bitcoin address format. Uses `OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG`.

| Property | Value |
|----------|-------|
| Prefix (mainnet) | `1` |
| Prefix (testnet) | `m` or `n` |
| Encoding | Base58Check |
| Address length | 25-34 characters |
| Witness version | N/A (pre-SegWit) |
| Enum value | `AddressTypes.P2PKH` |

### Detection

```typescript
import { AddressVerificator, AddressTypes } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const type = AddressVerificator.detectAddressType('1A1zP1...', networks.bitcoin);
// Returns AddressTypes.P2PKH
```

### How It Works

The transaction builder automatically detects P2PKH inputs by examining the `scriptPubKey`. When a UTXO has a P2PKH script (`OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG`), the builder generates a legacy scriptSig with the ECDSA signature and compressed public key.

P2PKH UTXOs require the `nonWitnessUtxo` field (the full previous transaction) for PSBT signing:

```typescript
const utxo: UTXO = {
    transactionId: 'abc...',
    outputIndex: 0,
    value: 10_000n,
    scriptPubKey: { hex: '76a914...88ac', address: '1A1z...' },
    nonWitnessUtxo: fullPreviousTxBytes,
};
```

---

## P2SH -- Pay-to-Script-Hash

Allows sending to a script hash. The redeemer must provide the script that hashes to the committed value, plus data to satisfy it.

| Property | Value |
|----------|-------|
| Prefix (mainnet) | `3` |
| Prefix (testnet) | `2` |
| Encoding | Base58Check |
| Address length | 34 characters |
| Witness version | N/A (pre-SegWit) |
| Enum value | `AddressTypes.P2SH_OR_P2SH_P2WPKH` |

### P2SH-P2WPKH (Nested SegWit)

The most common P2SH usage today wraps a P2WPKH script inside P2SH, providing SegWit benefits while maintaining backward compatibility with older software that only recognizes P2SH addresses.

```typescript
const utxo: UTXO = {
    transactionId: 'abc...',
    outputIndex: 0,
    value: 10_000n,
    scriptPubKey: { hex: 'a914...87', address: '3...' },
    redeemScript: '0014...', // P2WPKH script inside P2SH
};
```

> **Note:** `AddressVerificator.detectAddressType()` returns `P2SH_OR_P2SH_P2WPKH` because it cannot distinguish pure P2SH from P2SH-P2WPKH by address alone. The `redeemScript` determines the actual spending path.

---

## P2WPKH -- Pay-to-Witness-Public-Key-Hash

Native SegWit v0 address for single-key spending. Signature and public key are moved to the witness field, benefiting from the witness discount.

| Property | Value |
|----------|-------|
| Prefix (mainnet) | `bc1q` |
| Prefix (testnet) | `tb1q` |
| Prefix (opnetTestnet) | `opt1q` |
| Prefix (regtest) | `bcrt1q` |
| Encoding | Bech32 |
| Address length | 42 characters (mainnet) |
| Data length | 20 bytes (HASH160 of public key) |
| Witness version | 0 |
| Enum value | `AddressTypes.P2WPKH` |

### Detection

```typescript
const isP2WPKH = AddressVerificator.isP2WPKHAddress('bc1q...', networks.bitcoin);
// true if version=0 and data=20 bytes
```

### Creation

The library automatically generates P2WPKH addresses when using `AddressGenerator.generatePKSH()`:

```typescript
import { AddressGenerator } from '@btc-vision/transaction';

const p2wpkhAddress = AddressGenerator.generatePKSH(sha256Hash, network);
// Returns bc1q... address
```

---

## P2WSH -- Pay-to-Witness-Script-Hash

Native SegWit v0 address for script-based spending. The witness script is committed via SHA256 (not HASH160 like P2SH).

| Property | Value |
|----------|-------|
| Prefix (mainnet) | `bc1q` |
| Prefix (testnet) | `tb1q` |
| Prefix (opnetTestnet) | `opt1q` |
| Prefix (regtest) | `bcrt1q` |
| Encoding | Bech32 |
| Address length | 62 characters (mainnet) |
| Data length | 32 bytes (SHA256 of witness script) |
| Witness version | 0 |
| Enum value | `AddressTypes.P2WSH` |

### Use Cases in OPNet

P2WSH is used extensively in OPNet for:

1. **Epoch challenge timelocks** -- `TimeLockGenerator` creates P2WSH outputs with CSV-locked witness scripts for miner rewards
2. **Multi-signature** -- `MultiSignTransaction` uses P2WSH for M-of-N multisig scripts
3. **Consolidated interactions (CHCT)** -- `ConsolidatedInteractionTransaction` creates P2WSH outputs with HASH160 data commitments

```typescript
// P2WSH address with witness script
const p2wsh: IP2WSHAddress = {
    address: 'bc1q...', // 62-character bech32 address
    witnessScript: witnessScriptBytes,
};
```

---

## P2TR -- Pay-to-Taproot

Taproot (SegWit v1) addresses provide the most efficient single-key spending and support complex script trees via Tapscript.

| Property | Value |
|----------|-------|
| Prefix (mainnet) | `bc1p` |
| Prefix (testnet) | `tb1p` |
| Prefix (opnetTestnet) | `opt1p` |
| Prefix (regtest) | `bcrt1p` |
| Encoding | Bech32m |
| Address length | 62 characters (mainnet) |
| Data length | 32 bytes (x-only public key) |
| Witness version | 1 |
| Enum value | `AddressTypes.P2TR` |

### Key-Path vs Script-Path

| Spending Path | Witness | Use Case |
|---------------|---------|----------|
| Key-path | Single 64-byte Schnorr signature | Standard transfers, most interactions |
| Script-path | Script + control block + witnesses | Contract deployment, interaction data embedding |

### Detection and Validation

```typescript
const isP2TR = AddressVerificator.isValidP2TRAddress('bc1p...', networks.bitcoin);
// true if version=1 and data=32 bytes
```

### Address Generation

```typescript
import { AddressGenerator } from '@btc-vision/transaction';

const p2trAddress = AddressGenerator.generateTaprootAddress(xOnlyPubKey, network);
// Returns bc1p... address (bech32m)
```

### Role in OPNet

P2TR is the **default address type** for OPNet:

- **Contract addresses** are P2TR (Taproot) addresses
- **User wallets** typically use P2TR for the best fee efficiency
- **Interaction transactions** embed data in Tapscript leaves
- **Deployment transactions** use Tapscript for bytecode embedding

> **Quantum Safety:** For quantum-resistant outputs, use **P2MR** (BIP 360) instead. All transaction builders accept `useP2MR: true` to switch from P2TR to P2MR. See the [P2MR section](#p2mr----pay-to-merkle-root-bip-360) below.

---

## P2MR -- Pay-to-Merkle-Root (BIP 360)

A quantum-safe SegWit version 2 output type that commits directly to a Merkle root, eliminating the quantum-vulnerable key-path spend of P2TR.

| Property | Value |
|----------|-------|
| Prefix (mainnet) | `bc1z` |
| Prefix (testnet) | `tb1z` |
| Prefix (opnetTestnet) | `opt1z` |
| Prefix (regtest) | `bcrt1z` |
| Encoding | Bech32m |
| Address length | 62 characters (mainnet) |
| Data length | 32 bytes (Merkle root) |
| Witness version | 2 |
| Output format | `OP_2 <32-byte merkle_root>` |

### Key Difference from P2TR

P2MR has **no internal public key** and therefore **no key-path spend**. All spending must go through the script-path. This eliminates the quantum attack vector where a quantum computer could derive the private key from the internal public key exposed in the output.

| Feature | P2TR | P2MR |
|---------|------|------|
| Internal pubkey | Yes (exposed in output) | No |
| Key-path spend | Yes | No |
| Script-path spend | Yes | Yes |
| Control block size | `33 + 32*m` bytes | `1 + 32*m` bytes |
| Quantum resistance | Vulnerable (key-path) | Resistant |
| Address prefix | `bc1p` | `bc1z` |

### Detection

```typescript
import { isP2MR } from '@btc-vision/bitcoin';

const isP2MROutput = isP2MR(scriptPubKey);
// true if version=2 and data=32 bytes
```

### Usage in Transactions

All transaction builders support P2MR via the `useP2MR` flag:

```typescript
const result = await factory.signInteraction({
    // ... other params
    useP2MR: true,   // Use P2MR instead of P2TR
});
```

When `useP2MR` is `true`, the transaction builder:
- Generates P2MR outputs (no internal pubkey)
- Uses smaller control blocks (32 bytes saved per script-path input)
- Produces addresses starting with `bc1z` instead of `bc1p`
- Only supports script-path spending (no key-path)

### Multi-Signature with P2MR

```typescript
import { P2MR_MS } from '@btc-vision/transaction';

const multisigAddress = P2MR_MS.generateMultiSigAddress(
    [pubkey1, pubkey2, pubkey3],
    2,                       // 2-of-3
    networks.bitcoin,
);
// Returns bc1z... address
```

### CSV Time-Locked P2MR Addresses

```typescript
const csvAddress = address.toCSVP2MR(144, networks.bitcoin);
// Returns a P2MR address with a 144-block CSV timelock
```

---

## P2OP -- Pay-to-OPNet

A custom OPNet-specific address type using witness version 16 for smart contract identification.

| Property | Value |
|----------|-------|
| Prefix (mainnet) | `bc1s` |
| Prefix (testnet) | `tb1s` |
| Prefix (regtest) | `bcrt1s` |
| Encoding | Bech32m |
| Data length | 21 bytes |
| Witness version | 16 |
| Enum value | `AddressTypes.P2OP` |

### Detection

```typescript
const isP2OP = AddressVerificator.isValidP2OPAddress(address, network);
// true if version=16 and data=21 bytes with correct prefix
```

### Purpose

P2OP addresses identify OPNet smart contracts on the Bitcoin network. They are derived from contract bytecode and deployment parameters, providing a unique on-chain identifier for each contract.

See [P2OP Addresses](./P2OP.md) for detailed documentation.

---

## P2WDA -- Pay-to-Witness-Data-Authentication

A quantum-resistant witness data authentication scheme built on P2WSH. The witness field carries both the authentication data and arbitrary payload data.

| Property | Value |
|----------|-------|
| Prefix | Same as P2WSH (`bc1q...`) |
| Encoding | Bech32 |
| Witness version | 0 (P2WSH) |
| Enum value | `AddressTypes.P2WDA` |

### Detection

P2WDA addresses look identical to P2WSH addresses. Detection requires examining the witness script:

```typescript
// From address alone (cannot distinguish from P2WSH)
const type = AddressVerificator.detectAddressType(address, network);
// Returns AddressTypes.P2WSH

// With witness script (can detect P2WDA)
const typeWithWitness = AddressVerificator.detectAddressTypeWithWitnessScript(
    address,
    network,
    witnessScript,
);
// Returns AddressTypes.P2WDA if witness script matches pattern

// Validate P2WDA address
const validation = AddressVerificator.validateP2WDAAddress(address, network, witnessScript);
// Returns { isValid, isPotentiallyP2WDA, isDefinitelyP2WDA, publicKey?, error? }
```

### Witness Script Pattern

The P2WDA witness script follows the pattern: `(OP_2DROP * 5) <pubkey> OP_CHECKSIG`

This allows embedding 5 data slots in the witness while requiring a valid signature for spending.

See [P2WDA Addresses](./P2WDA.md) for detailed documentation.

---

## P2A -- Pay-to-Anchor

Minimal anchor outputs used for Child-Pays-for-Parent (CPFP) fee bumping.

| Property | Value |
|----------|-------|
| Script | `OP_1 OP_PUSHBYTES_2 4e73` |
| Value | 0 satoshis |
| Enum value | N/A (detected by script) |

### Usage

Anchor outputs are added via the `anchor` parameter:

```typescript
const params: ITransactionParameters = {
    anchor: true, // Adds a P2A anchor output
    // ...other parameters
};
```

Or manually:

```typescript
import { ANCHOR_SCRIPT } from '@btc-vision/transaction';

builder.addAnchor();
// Adds output: { value: 0, script: ANCHOR_SCRIPT }
```

### Detection

```typescript
import { isP2A } from '@btc-vision/bitcoin';

const isAnchor = isP2A(outputScript);
```

---

## P2PK -- Pay-to-Public-Key

The simplest Bitcoin output type. Pays directly to a public key without hashing.

| Property | Value |
|----------|-------|
| Encoding | Raw hex public key |
| Enum value | `AddressTypes.P2PK` |

### Detection

```typescript
const isPublicKey = AddressVerificator.isValidPublicKey(input, network);
// Supports 33-byte compressed, 65-byte uncompressed, and 32-byte x-only keys
```

> **Note:** P2PK is rarely used for new outputs but may appear in legacy UTXOs. The library supports spending P2PK inputs.

---

## Address Type Detection

The `AddressVerificator` class provides comprehensive address type detection:

```typescript
import { AddressVerificator, AddressTypes } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

const network = networks.bitcoin;

// Detect any address type
const type = AddressVerificator.detectAddressType(address, network);

switch (type) {
    case AddressTypes.P2TR:
        console.log('Taproot address');
        break;
    case AddressTypes.P2MR:
        console.log('Pay-to-Merkle-Root address (quantum-safe)');
        break;
    case AddressTypes.P2WPKH:
        console.log('Native SegWit address');
        break;
    case AddressTypes.P2WSH:
        console.log('Witness Script Hash address');
        break;
    case AddressTypes.P2PKH:
        console.log('Legacy address');
        break;
    case AddressTypes.P2SH_OR_P2SH_P2WPKH:
        console.log('P2SH or nested SegWit');
        break;
    case AddressTypes.P2OP:
        console.log('OPNet contract address');
        break;
    case AddressTypes.P2PK:
        console.log('Raw public key');
        break;
    case null:
        console.log('Unknown address type');
        break;
}
```

---

## Network Prefixes

Address prefixes vary by network:

| Type | Mainnet | Testnet | OPNet Testnet | Regtest |
|------|---------|---------|---------------|---------|
| P2PKH | `1` | `m` / `n` | `m` / `n` | `m` / `n` |
| P2SH | `3` | `2` | `2` | `2` |
| Bech32 (v0) | `bc1q` | `tb1q` | `opt1q` | `bcrt1q` |
| Bech32m (v1, P2TR) | `bc1p` | `tb1p` | `opt1p` | `bcrt1p` |
| Bech32m (v2, P2MR) | `bc1z` | `tb1z` | `opt1z` | `bcrt1z` |

---

## UTXO Script Requirements

Different address types require different fields in the `UTXO` interface:

| Address Type | `scriptPubKey` | `redeemScript` | `witnessScript` | `nonWitnessUtxo` |
|-------------|----------------|----------------|-----------------|-------------------|
| P2PKH | Required | -- | -- | Required |
| P2SH | Required | Required | -- | -- |
| P2SH-P2WPKH | Required | Required | -- | -- |
| P2WPKH | Required | -- | -- | -- |
| P2WSH | Required | -- | Required | -- |
| P2TR | Required | -- | -- | -- |
| P2MR | Required | -- | -- | -- |
| P2WDA | Required | -- | Required | -- |

```typescript
// P2TR UTXO (simplest)
const p2trUtxo: UTXO = {
    transactionId: 'abc...',
    outputIndex: 0,
    value: 50_000n,
    scriptPubKey: { hex: '5120...', address: 'bc1p...' },
};

// P2PKH UTXO (needs full previous tx)
const p2pkhUtxo: UTXO = {
    transactionId: 'def...',
    outputIndex: 1,
    value: 30_000n,
    scriptPubKey: { hex: '76a914...88ac', address: '1...' },
    nonWitnessUtxo: previousTxBytes,
};

// P2WSH UTXO (needs witness script)
const p2wshUtxo: UTXO = {
    transactionId: 'ghi...',
    outputIndex: 0,
    value: 20_000n,
    scriptPubKey: { hex: '0020...', address: 'bc1q...' },
    witnessScript: witnessScriptBytes,
};
```

---

## See Also

- [P2OP Addresses](./P2OP.md) -- Detailed P2OP documentation
- [P2WDA Addresses](./P2WDA.md) -- Detailed P2WDA documentation
- [AddressVerificator](../keypair/address-verificator.md) -- Address validation API
- [Transaction Types](../api-reference/transaction-types.md) -- `AddressTypes` enum reference
- [Interfaces](../api-reference/interfaces.md) -- `UTXO` interface reference
