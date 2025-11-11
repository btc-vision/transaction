# Mnemonic & Wallet Management

## Table of Contents
- [Generating a Mnemonic](#generating-a-mnemonic)
- [Loading Existing Mnemonic](#loading-existing-mnemonic)
- [Deriving Wallets](#deriving-wallets)
  - [Unisat Wallet Compatibility](#unisat-wallet-compatibility)
- [Wallet Properties](#wallet-properties)
- [Security Best Practices](#security-best-practices)
- [Advanced Usage](#advanced-usage)

## Generating a Mnemonic

### Basic Generation

Generate a new 12-word mnemonic with quantum support:

```typescript
import { Mnemonic, MnemonicStrength, MLDSASecurityLevel } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// Generate with default 12 words and LEVEL2 security (BIP360 RECOMMENDED DEFAULT)
const mnemonic = Mnemonic.generate();

console.log('Mnemonic phrase:', mnemonic.phrase);
console.log('Security Level:', mnemonic.securityLevel); // LEVEL2 (default)
// Output: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
```

### Custom Strength and Security Level

```typescript
// RECOMMENDED: Use LEVEL2 (BIP360 default) for most applications
const recommendedMnemonic = Mnemonic.generate(
    MnemonicStrength.MAXIMUM,            // 24 words
    '',                                   // No passphrase
    networks.bitcoin,                     // Mainnet
    MLDSASecurityLevel.LEVEL2            // RECOMMENDED DEFAULT (BIP360)
);

console.log('Words:', recommendedMnemonic.phrase.split(' ').length); // 24
console.log('Security Level:', recommendedMnemonic.securityLevel);   // LEVEL2

// OPTIONAL: Use LEVEL5 only for maximum security in high-value applications
const maxSecurityMnemonic = Mnemonic.generate(
    MnemonicStrength.MAXIMUM,            // 24 words
    '',                                   // No passphrase
    networks.bitcoin,                     // Mainnet
    MLDSASecurityLevel.LEVEL5            // Maximum quantum security (optional)
);

console.log('Security Level:', maxSecurityMnemonic.securityLevel);   // LEVEL5
```

### Available Mnemonic Strengths

```typescript
enum MnemonicStrength {
    MINIMUM = 128,   // 12 words - Standard
    LOW = 160,       // 15 words
    MEDIUM = 192,    // 18 words
    HIGH = 224,      // 21 words
    MAXIMUM = 256    // 24 words - Maximum entropy
}
```

### With Network and Passphrase

```typescript
// Generate for testnet with BIP39 passphrase
const testnetMnemonic = Mnemonic.generate(
    MnemonicStrength.MINIMUM,             // 12 words
    'my-secret-passphrase',              // BIP39 passphrase (optional)
    networks.testnet,                     // Testnet network
    MLDSASecurityLevel.LEVEL2            // RECOMMENDED DEFAULT (BIP360)
);
```

## Loading Existing Mnemonic

### From Phrase

```typescript
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const mnemonic = new Mnemonic(
    phrase,
    '',                                   // Passphrase (use same as generation)
    networks.bitcoin,                     // Network
    MLDSASecurityLevel.LEVEL2            // RECOMMENDED DEFAULT (BIP360) - must match original
);

console.log('Network:', mnemonic.network.bech32);     // 'bc'
console.log('Security:', mnemonic.securityLevel);     // LEVEL2 (BIP360 default)
```

### Validating Mnemonic

```typescript
import * as bip39 from 'bip39';

const phrase = 'abandon abandon abandon...';

// Validate BIP39 mnemonic
if (!bip39.validateMnemonic(phrase)) {
    throw new Error('Invalid mnemonic phrase');
}

const mnemonic = new Mnemonic(phrase);
```

## Deriving Wallets

### Single Wallet Derivation

```typescript
const mnemonic = Mnemonic.generate();

// Derive wallet at index 0
const wallet0 = mnemonic.derive(0);

// Derive wallet at index 1
const wallet1 = mnemonic.derive(1);

// Each wallet has both classical and quantum keys
console.log('Classical Public Key:', wallet0.publicKey);
console.log('Quantum Public Key:', wallet0.quantumPublicKeyHex);
```

### Multiple Wallet Derivation

```typescript
// Derive first 5 wallets
const wallets = mnemonic.deriveMultiple(5);

wallets.forEach((wallet, index) => {
    console.log(`Wallet ${index}:`);
    console.log('  P2TR:', wallet.p2tr);
    console.log('  ML-DSA Hash:', wallet.address.toHex());
});
```

### Custom Derivation Path

```typescript
// Custom BIP44/BIP84 path
const customWallet = mnemonic.deriveCustomPath(
    "m/84'/0'/0'/0/5",  // BIP84 path for account 0, index 5
    "m/360'/0'/0'/0/5"  // BIP360 quantum path (parallel)
);

console.log('Custom wallet address:', customWallet.p2wpkh);
```

### Unisat Wallet Compatibility

For compatibility with Unisat and other HD wallets, use `deriveUnisat()` which follows standard BIP derivation paths:

```typescript
import { AddressTypes } from '@btc-vision/transaction';

const mnemonic = Mnemonic.generate();

// Derive P2TR (Taproot) - BIP86
const taprootWallet = mnemonic.deriveUnisat(AddressTypes.P2TR, 0);
console.log('Taproot:', taprootWallet.p2tr); // bc1p...

// Derive P2WPKH (Native SegWit) - BIP84
const segwitWallet = mnemonic.deriveUnisat(AddressTypes.P2WPKH, 0);
console.log('Native SegWit:', segwitWallet.p2wpkh); // bc1q...

// Derive P2PKH (Legacy) - BIP44
const legacyWallet = mnemonic.deriveUnisat(AddressTypes.P2PKH, 0);
console.log('Legacy:', legacyWallet.legacy); // 1...

// Derive P2SH (Nested SegWit) - BIP49
const nestedSegwitWallet = mnemonic.deriveUnisat(AddressTypes.P2SH_OR_P2SH_P2WPKH, 0);
console.log('Nested SegWit:', nestedSegwitWallet.segwitLegacy); // 3...
```

#### BIP Standard Mapping

The `deriveUnisat()` method automatically maps address types to BIP standards:

| Address Type | BIP Standard | Path Format | Address Prefix |
|--------------|-------------|-------------|----------------|
| P2TR | BIP86 | `m/86'/0'/account'/change/index` | bc1p... (mainnet) |
| P2WPKH | BIP84 | `m/84'/0'/account'/change/index` | bc1q... (mainnet) |
| P2PKH | BIP44 | `m/44'/0'/account'/change/index` | 1... (mainnet) |
| P2SH | BIP49 | `m/49'/0'/account'/change/index` | 3... (mainnet) |

**Note**: Unisat-compatible paths always use coin type `0` for the purpose field, regardless of network.

#### Accounts and Change Addresses

```typescript
// Main account (account 0), receiving addresses
const receiving0 = mnemonic.deriveUnisat(AddressTypes.P2TR, 0, 0, false);
const receiving1 = mnemonic.deriveUnisat(AddressTypes.P2TR, 1, 0, false);

// Main account (account 0), change addresses
const change0 = mnemonic.deriveUnisat(AddressTypes.P2TR, 0, 0, true);
const change1 = mnemonic.deriveUnisat(AddressTypes.P2TR, 1, 0, true);

// Second account (account 1), receiving addresses
const account1_0 = mnemonic.deriveUnisat(AddressTypes.P2TR, 0, 1, false);

console.log('Receiving 0:', receiving0.p2tr);
console.log('Receiving 1:', receiving1.p2tr);
console.log('Change 0:', change0.p2tr);
console.log('Account 1:', account1_0.p2tr);
```

#### Bulk Derivation

Derive multiple Unisat-compatible wallets at once:

```typescript
// Derive first 5 Taproot addresses
const taprootWallets = mnemonic.deriveMultipleUnisat(
    AddressTypes.P2TR,  // Address type
    5,                  // Count
    0,                  // Start index
    0,                  // Account
    false              // Not change addresses
);

taprootWallets.forEach((wallet, i) => {
    console.log(`Address ${i}: ${wallet.p2tr}`);
});

// Derive 10 Native SegWit change addresses starting from index 5
const changeWallets = mnemonic.deriveMultipleUnisat(
    AddressTypes.P2WPKH,  // Native SegWit
    10,                   // Count
    5,                    // Start at index 5
    0,                    // Account 0
    true                  // Change addresses
);
```

#### Quantum Keys with Unisat Derivation

All Unisat-derived wallets include both classical and quantum keys:

```typescript
const wallet = mnemonic.deriveUnisat(AddressTypes.P2TR, 0);

// Classical Taproot address (BIP86)
console.log('Classical P2TR:', wallet.p2tr);

// Quantum ML-DSA keys (BIP360: m/360'/0'/0'/0/0)
console.log('Quantum Public Key:', wallet.quantumPublicKeyHex);
console.log('Security Level:', wallet.securityLevel);

// Both keys are deterministically derived
console.log('Has quantum keypair:', wallet.mldsaKeypair !== undefined); // true
```

## Wallet Properties

### Classical Keys

```typescript
const wallet = mnemonic.derive(0);

// Public keys
console.log('Compressed:', wallet.publicKey);              // 33 bytes
console.log('Hex:', wallet.toPublicKeyHex());             // 0x...
console.log('Uncompressed:', wallet.toUncompressedPublicKey()); // 65 bytes

// Private key (handle with care!)
console.log('Private key:', wallet.privateKey);            // 32 bytes hex

// Key pair
console.log('EC Keypair:', wallet.keypair);                // ECPairInterface
```

### Quantum Keys

```typescript
// ML-DSA keypair
console.log('ML-DSA Keypair:', wallet.mldsaKeypair);
console.log('Security Level:', wallet.securityLevel);      // LEVEL2, LEVEL3, or LEVEL5

// Quantum public keys
console.log('Public Key (hex):', wallet.quantumPublicKeyHex);
console.log('Public Key (buffer):', wallet.quantumPublicKey);
console.log('Public Key Size:', wallet.quantumPublicKey.length); // 1312, 1952, or 2592 bytes
```

### Addresses

```typescript
// Classical addresses
console.log('P2TR:', wallet.p2tr);                        // bc1p...
console.log('P2WPKH:', wallet.p2wpkh);                    // bc1q...
console.log('Legacy (P2PKH):', wallet.legacy);            // 1...

// Quantum address
console.log('Public Key:', wallet.address.toHex());

// Address object
const address = wallet.address;
console.log('ML-DSA Hash:', address.toHex());             // SHA256 of quantum key
console.log('Classical Key:', address.tweakedToHex());    // Classical public key
```

## Security Best Practices

### ⚠️ Mnemonic Security

```typescript
const mnemonic = Mnemonic.generate();

// ✅ GOOD: Store securely
// - Hardware wallets
// - Encrypted storage
// - Paper backup in secure location

// ❌ BAD: Don't do this!
// - console.log(mnemonic.phrase)  // Never log in production
// - Save to file unencrypted
// - Transmit over network
// - Store in version control

// Access sensitive data only when needed
const phrase = mnemonic.phrase;        // ⚠️ Warning: Highly sensitive
const seed = mnemonic.seed;            // ⚠️ Warning: Highly sensitive
```

### Passphrase Protection

```typescript
// Add extra security layer with passphrase
const passphrase = 'my-very-strong-passphrase-12345';

const mnemonic = Mnemonic.generate(
    MnemonicStrength.MAXIMUM,            // 24 words
    passphrase,                          // Required to recover wallet
    networks.bitcoin,                     // Mainnet
    MLDSASecurityLevel.LEVEL3            // Security level
);

// ⚠️ IMPORTANT: You need BOTH mnemonic AND passphrase to recover!
// Losing either means permanent loss of funds
```

### Network Awareness

```typescript
// Different networks generate different keys!
const mainnetMnemonic = new Mnemonic(phrase, '', networks.bitcoin);
const testnetMnemonic = new Mnemonic(phrase, '', networks.testnet);

const mainnetWallet = mainnetMnemonic.derive(0);
const testnetWallet = testnetMnemonic.derive(0);

// These will be DIFFERENT addresses even with same mnemonic
console.log('Mainnet:', mainnetWallet.p2tr);  // bc1p...
console.log('Testnet:', testnetWallet.p2tr);  // tb1p...
```

## Advanced Usage

### Accessing Root Keys

```typescript
const mnemonic = Mnemonic.generate();

// Classical BIP32 root
const classicalRoot = mnemonic.classicalRoot;
console.log('Classical xpub:', classicalRoot.toBase58());

// Quantum BIP32 root
const quantumRoot = mnemonic.quantumRoot;
console.log('Quantum key size:', quantumRoot.publicKey.length);
```

### Chain Codes

```typescript
const mnemonic = Mnemonic.generate();
const wallet = mnemonic.derive(0);

// Chain codes for key derivation
console.log('Classical chain code:', wallet.keypair.chainCode?.toString('hex'));
console.log('Quantum chain code:', wallet.mldsaKeypair.chainCode.toString('hex'));
```

### Deterministic Derivation

```typescript
// Same mnemonic always generates same wallets
const mnemonic1 = new Mnemonic('abandon abandon abandon...', '');
const mnemonic2 = new Mnemonic('abandon abandon abandon...', '');

const wallet1 = mnemonic1.derive(0);
const wallet2 = mnemonic2.derive(0);

console.log(wallet1.p2tr === wallet2.p2tr);  // true - deterministic!
```

## Complete Example

```typescript
import { Mnemonic, MnemonicStrength, MLDSASecurityLevel } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';

// Step 1: Generate mnemonic
console.log('Generating quantum-resistant wallet...');
const mnemonic = Mnemonic.generate(
    MnemonicStrength.MAXIMUM,            // 24 words
    'optional-passphrase',               // BIP39 passphrase
    networks.bitcoin,                     // Network
    MLDSASecurityLevel.LEVEL2            // Security level
);

// Step 2: Securely store mnemonic phrase
const phrase = mnemonic.phrase;
console.log('⚠️ IMPORTANT: Backup these 24 words securely:');
console.log(phrase);

// Step 3: Derive wallets
const wallet = mnemonic.derive(0);

// Step 4: Get addresses
console.log('\nClassical Addresses:');
console.log('P2TR:', wallet.p2tr);
console.log('P2WPKH:', wallet.p2wpkh);

console.log('\nQuantum Address:');
console.log('Public Key:', wallet.address.toHex());

// Step 5: Display keys (for demonstration only!)
console.log('\nKey Information:');
console.log('Classical Public Key:', wallet.toPublicKeyHex());
console.log('Quantum Public Key Length:', wallet.quantumPublicKey.length, 'bytes');
console.log('Security Level:', wallet.securityLevel);
```

## Next Steps

- [Address Generation](./03-address-generation.md) - Generate classical and quantum addresses
- [Message Signing](./04-message-signing.md) - Sign messages with ML-DSA
