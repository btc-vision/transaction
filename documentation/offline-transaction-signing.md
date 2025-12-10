# Offline Transaction Signing

This module enables secure offline transaction signing workflows. Transactions can be built in an online environment, exported to an air-gapped offline server for signing, then broadcast from the online environment.

## Overview

The offline signing workflow separates transaction construction from signing:

```mermaid
flowchart LR
    subgraph Online["Phase 1 (Online)"]
        A[Build Transaction] --> B[Export State]
        B --> C["No Private Keys"]
    end

    subgraph Offline["Phase 2 (Offline)"]
        D[Import State] --> E[Provide Signers]
        E --> F[Sign Transaction]
        F --> G[Export Signed TX]
    end

    C -->|base64| D
```

## Quick Start

### Basic Usage

```typescript
import {
    OfflineTransactionManager,
    IFundingTransactionParameters
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// Phase 1: Online - Export transaction state
const params: IFundingTransactionParameters = {
    signer: onlineSigner,
    mldsaSigner: null,
    network: networks.bitcoin,
    utxos: [...],
    from: 'bc1p...',
    to: 'bc1p...',
    feeRate: 10,
    priorityFee: 1000n,
    gasSatFee: 500n,
    amount: 50000n,
};

const exportedState = OfflineTransactionManager.exportFunding(params);
// Send exportedState (base64 string) to offline environment

// Phase 2: Offline - Sign and export
const signedTxHex = await OfflineTransactionManager.importSignAndExport(
    exportedState,
    { signer: offlineSigner }
);
// Send signedTxHex back to online environment for broadcast
```

### Fee Bumping (RBF)

```mermaid
flowchart LR
    A["Original State<br/>(10 sat/vB)"] --> B[rebuildWithNewFees]
    B --> C["New State<br/>(50 sat/vB)"]
    C --> D[Sign & Export]
    D --> E[Signed TX Hex]
```

```typescript
// Rebuild with higher fee rate (returns new state, not signed)
const bumpedState = OfflineTransactionManager.rebuildWithNewFees(
    originalState,
    50, // New fee rate in sat/vB
    { signer: offlineSigner }
);

// Or rebuild and sign in one step
const signedBumpedTx = await OfflineTransactionManager.rebuildSignAndExport(
    originalState,
    50,
    { signer: offlineSigner }
);
```

## API Reference

### OfflineTransactionManager

The main entry point for offline transaction workflows.

#### Export Methods

```typescript
// Export a FundingTransaction
static exportFunding(
    params: IFundingTransactionParameters,
    precomputed?: Partial<PrecomputedData>
): string;

// Export a DeploymentTransaction
static exportDeployment(
    params: IDeploymentParameters,
    precomputed: { compiledTargetScript: string; randomBytes: string; }
): string;

// Export an InteractionTransaction
static exportInteraction(
    params: IInteractionParameters,
    precomputed: { compiledTargetScript: string; randomBytes: string; }
): string;

// Export a MultiSignTransaction
static exportMultiSig(
    params: MultiSigParams,
    precomputed?: Partial<PrecomputedData>
): string;

// Export a CustomScriptTransaction
static exportCustomScript(
    params: CustomScriptParams,
    precomputed?: Partial<PrecomputedData>
): string;

// Export a CancelTransaction
static exportCancel(
    params: CancelParams,
    precomputed?: Partial<PrecomputedData>
): string;
```

#### Import and Sign Methods

```typescript
// Import state and prepare for signing
static importForSigning(
    serializedState: string,
    options: ReconstructionOptions
): TransactionBuilder<TransactionType>;

// Sign a reconstructed builder
static async signAndExport(
    builder: TransactionBuilder<TransactionType>
): Promise<string>;

// Convenience: Import, sign, and export in one call
static async importSignAndExport(
    serializedState: string,
    options: ReconstructionOptions
): Promise<string>;
```

#### Fee Bumping Methods

```typescript
// Rebuild state with new fee rate (returns new state, not signed)
static rebuildWithNewFees(
    serializedState: string,
    newFeeRate: number,
    options: ReconstructionOptions
): string;

// Rebuild, sign, and export with new fee rate
static async rebuildSignAndExport(
    serializedState: string,
    newFeeRate: number,
    options: ReconstructionOptions
): Promise<string>;
```

#### Utility Methods

```typescript
// Inspect serialized state without signing
static inspect(serializedState: string): ISerializableTransactionState;

// Validate state integrity (checksum verification)
static validate(serializedState: string): boolean;

// Get transaction type from state
static getType(serializedState: string): TransactionType;

// Parse/serialize state objects
static fromBase64(base64State: string): ISerializableTransactionState;
static toBase64(state: ISerializableTransactionState): string;

// Format conversion (base64 <-> hex)
static toHex(serializedState: string): string;
static fromHex(hexState: string): string;
```

### ReconstructionOptions

Options for reconstructing a transaction from serialized state:

```typescript
interface ReconstructionOptions {
    // Primary signer (required)
    signer: Signer | ECPairInterface;

    // Optional: Override fee rate for fee bumping
    newFeeRate?: number;

    // Optional: Override priority fee
    newPriorityFee?: bigint;

    // Optional: Override gas sat fee
    newGasSatFee?: bigint;

    // Signer map for address rotation mode
    signerMap?: SignerMap;

    // MLDSA signer for quantum-resistant features
    mldsaSigner?: QuantumBIP32Interface | null;
}
```

## Address Rotation Mode

For wallets with multiple addresses (different signers per UTXO):

```mermaid
flowchart TB
    subgraph UTXOs["Input UTXOs"]
        U1["UTXO 1<br/>address1"]
        U2["UTXO 2<br/>address2"]
        U3["UTXO 3<br/>address1"]
    end

    subgraph SignerMap["Signer Map"]
        S1["address1 → signer1"]
        S2["address2 → signer2"]
    end

    U1 --> S1
    U2 --> S2
    U3 --> S1

    S1 --> TX[Signed Transaction]
    S2 --> TX
```

```typescript
import {
    OfflineTransactionManager,
    createSignerMap,
    createAddressRotation
} from '@btc-vision/transaction';

// Phase 1: Export with address rotation enabled
const signerMap = createSignerMap([
    { address: 'bc1p...address1', signer: signer1 },
    { address: 'bc1p...address2', signer: signer2 },
], network);

const params: IFundingTransactionParameters = {
    signer: signer1,
    mldsaSigner: null,
    network,
    utxos: [
        { /* UTXO from address1 */ },
        { /* UTXO from address2 */ },
    ],
    from: 'bc1p...address1',
    to: 'bc1p...recipient',
    feeRate: 10,
    priorityFee: 1000n,
    gasSatFee: 500n,
    amount: 50000n,
    addressRotation: createAddressRotation(signerMap),
};

const exported = OfflineTransactionManager.exportFunding(params);

// Phase 2: Provide signers for each address
const offlineSignerMap = createSignerMap([
    { address: 'bc1p...address1', signer: offlineSigner1 },
    { address: 'bc1p...address2', signer: offlineSigner2 },
], network);

const signedTx = await OfflineTransactionManager.importSignAndExport(
    exported,
    {
        signer: offlineSigner1,
        signerMap: offlineSignerMap,
    }
);
```

## Serialization Format

The serialized state uses a compact binary format with the following structure:

```mermaid
block-beta
    columns 1
    block:header["HEADER (16 bytes)"]
        columns 6
        a["0x42<br/>1B"]
        b["Format<br/>1B"]
        c["Consensus<br/>1B"]
        d["Type<br/>1B"]
        e["Chain ID<br/>4B"]
        f["Timestamp<br/>8B"]
    end
    block:body["BODY (variable)"]
        columns 1
        g["Base Params (from, to, feeRate, priorityFee, gasSatFee)"]
        h["UTXOs Array"]
        i["Optional Inputs"]
        j["Optional Outputs"]
        k["Signer Mappings (address → input indices)"]
        l["Type-Specific Data"]
        m["Precomputed Data"]
    end
    block:checksum["CHECKSUM (32 bytes)"]
        columns 1
        n["Double SHA256 Hash"]
    end
```

### Header Fields

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | Magic byte (0x42) |
| 1 | 1 | Format version |
| 2 | 1 | Consensus version |
| 3 | 1 | Transaction type |
| 4-7 | 4 | Chain ID |
| 8-15 | 8 | Timestamp |

## Supported Transaction Types

| Type | Export Method | Type-Specific Data |
|------|---------------|-------------------|
| Funding | `exportFunding()` | amount, splitInputsInto |
| Deployment | `exportDeployment()` | bytecode, calldata, challenge |
| Interaction | `exportInteraction()` | calldata, contract, challenge, loadedStorage |
| MultiSig | `exportMultiSig()` | pubkeys, minimumSignatures, receiver |
| CustomScript | `exportCustomScript()` | scriptElements, witnesses, annex |
| Cancel | `exportCancel()` | compiledTargetScript |

## Precomputed Data

Some transaction types require precomputed data that must be preserved for deterministic rebuilds:

```typescript
interface PrecomputedData {
    // Script signer seed - changing this changes signatures
    randomBytes?: string;

    // Complex scripts that are expensive to recompute
    compiledTargetScript?: string;

    // For deployment transactions
    contractSeed?: string;
    contractAddress?: string;

    // Estimated fees
    estimatedFees?: string;
}
```

For Deployment and Interaction transactions, `randomBytes` and `compiledTargetScript` are required:

```typescript
const exported = OfflineTransactionManager.exportDeployment(params, {
    randomBytes: builder.getRandomBytes().toString('hex'),
    compiledTargetScript: builder.getCompiledScript().toString('hex'),
});
```

## State Manipulation

You can parse, modify, and re-serialize state objects:

```typescript
// Parse state from base64
const state = OfflineTransactionManager.fromBase64(exportedState);

// Inspect or modify the state
console.log('Original fee rate:', state.baseParams.feeRate);
console.log('Transaction type:', state.header.transactionType);

// Modify state (e.g., update fee rate manually)
state.baseParams.feeRate = 30;

// Re-serialize to base64
const modifiedState = OfflineTransactionManager.toBase64(state);

// Sign the modified state
const signedTx = await OfflineTransactionManager.importSignAndExport(
    modifiedState,
    { signer: offlineSigner }
);
```

## Security Considerations

1. **Private keys are never serialized** - Only public keys and addresses are stored
2. **Signers must be provided at reconstruction time** by the offline device
3. **Checksum verification** prevents tampering with serialized state
4. **Format versioning** allows future security improvements

## Error Handling

```typescript
try {
    const state = OfflineTransactionManager.inspect(serializedState);
} catch (error) {
    if (error.message.includes('Invalid magic byte')) {
        // Not a valid offline transaction state
    } else if (error.message.includes('Invalid checksum')) {
        // Data corrupted or tampered with
    } else if (error.message.includes('Unsupported format version')) {
        // State created with newer version
    }
}

// Validate before processing
if (!OfflineTransactionManager.validate(serializedState)) {
    throw new Error('Invalid transaction state');
}
```

## Complete Example

```typescript
import {
    OfflineTransactionManager,
    IFundingTransactionParameters,
    TransactionType,
    EcKeyPair,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// === ONLINE ENVIRONMENT ===

const network = networks.bitcoin;
const signer = EcKeyPair.generateRandomKeyPair(network);
const address = EcKeyPair.getTaprootAddress(signer, network);

// Create transaction parameters
const params: IFundingTransactionParameters = {
    signer,
    mldsaSigner: null,
    network,
    utxos: [{
        transactionId: 'abc123...'.padEnd(64, '0'),
        outputIndex: 0,
        value: 100000n,
        scriptPubKey: {
            hex: '5120...',
            address,
        },
    }],
    from: address,
    to: 'bc1p...recipient',
    feeRate: 10,
    priorityFee: 1000n,
    gasSatFee: 500n,
    amount: 50000n,
};

// Export state (send this to offline environment)
const exportedState = OfflineTransactionManager.exportFunding(params);
console.log('Exported state length:', exportedState.length);

// Validate the export
console.log('Valid:', OfflineTransactionManager.validate(exportedState));

// Inspect metadata
const metadata = OfflineTransactionManager.inspect(exportedState);
console.log('Transaction type:', TransactionType[metadata.header.transactionType]);
console.log('Fee rate:', metadata.baseParams.feeRate);

// === OFFLINE ENVIRONMENT ===

// Import and sign (using the same signer for this example)
const signedTxHex = await OfflineTransactionManager.importSignAndExport(
    exportedState,
    { signer }
);

console.log('Signed transaction:', signedTxHex);

// === FEE BUMPING (if needed) ===

// Create new state with higher fee
const bumpedState = OfflineTransactionManager.rebuildWithNewFees(
    exportedState,
    50, // 5x higher fee rate
    { signer }
);

// Verify the new fee rate
const bumpedMetadata = OfflineTransactionManager.inspect(bumpedState);
console.log('New fee rate:', bumpedMetadata.baseParams.feeRate); // 50

// Sign the bumped transaction
const signedBumpedTx = await OfflineTransactionManager.importSignAndExport(
    bumpedState,
    { signer }
);

console.log('Signed bumped transaction:', signedBumpedTx);
```
