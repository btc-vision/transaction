/**
 * HD wallet derivation paths
 */
export enum DerivationPath {
    BIP84 = "m/84'/0'/0'/0/0", // Native SegWit (P2WPKH)
    BIP86 = "m/86'/0'/0'/0/0", // Taproot (P2TR)
    BIP44 = "m/44'/0'/0'/0/0", // Legacy (P2PKH)
    BIP49 = "m/49'/0'/0'/0/0", // SegWit (P2SH-P2WPKH)
    BIP360 = "m/360'/0'/0'/0/0", // Post-Quantum, experimental BIP360
}
