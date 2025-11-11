/**
 * BIP (Bitcoin Improvement Proposal) derivation path standards
 *
 * These define standardized derivation paths for different address types
 * in hierarchical deterministic (HD) wallets.
 *
 * @see https://github.com/bitcoin/bips
 */
export enum BIPStandard {
    /**
     * BIP44: Multi-Account Hierarchy for Deterministic Wallets
     *
     * Path: m/44'/coin_type'/account'/change/address_index
     * Original standard for P2PKH (legacy) addresses
     * Widely used by wallets like Unisat for all address types
     *
     * @see https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
     */
    BIP44 = 44,

    /**
     * BIP49: Derivation scheme for P2WPKH-nested-in-P2SH based accounts
     *
     * Path: m/49'/coin_type'/account'/change/address_index
     * For wrapped SegWit addresses (P2SH-P2WPKH starting with '3')
     *
     * @see https://github.com/bitcoin/bips/blob/master/bip-0049.mediawiki
     */
    BIP49 = 49,

    /**
     * BIP84: Derivation scheme for P2WPKH based accounts
     *
     * Path: m/84'/coin_type'/account'/change/address_index
     * For native SegWit addresses (P2WPKH starting with 'bc1q')
     * DEFAULT for this library
     *
     * @see https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki
     */
    BIP84 = 84,

    /**
     * BIP86: Derivation scheme for P2TR based accounts
     *
     * Path: m/86'/coin_type'/account'/change/address_index
     * For Taproot addresses (P2TR starting with 'bc1p')
     *
     * @see https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki
     */
    BIP86 = 86,
}

/**
 * Get a human-readable description of a BIP standard
 *
 * @param standard - The BIP standard
 * @returns A description of the standard and its typical use case
 */
export function getBIPDescription(standard: BIPStandard): string {
    switch (standard) {
        case BIPStandard.BIP44:
            return 'BIP44: Legacy addresses (P2PKH), widely used by Unisat and other wallets';
        case BIPStandard.BIP49:
            return 'BIP49: Wrapped SegWit addresses (P2SH-P2WPKH)';
        case BIPStandard.BIP84:
            return 'BIP84: Native SegWit addresses (P2WPKH) - DEFAULT';
        case BIPStandard.BIP86:
            return 'BIP86: Taproot addresses (P2TR)';
        default:
            return 'Unknown BIP standard';
    }
}

/**
 * Build a derivation path for a given BIP standard
 *
 * @param standard - The BIP standard to use
 * @param coinType - The coin type (0 for mainnet, 1 for testnet/regtest)
 * @param account - The account index
 * @param change - The change index (0 for receiving, 1 for change)
 * @param addressIndex - The address index
 * @returns The full derivation path
 */
export function buildBIPPath(
    standard: BIPStandard,
    coinType: number,
    account: number,
    change: number,
    addressIndex: number,
): string {
    return `m/${standard}'/${coinType}'/${account}'/${change}/${addressIndex}`;
}
