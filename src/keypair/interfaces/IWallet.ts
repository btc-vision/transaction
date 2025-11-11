/**
 * Interface for the generated wallet
 */
export interface IWallet {
    /**
     * The classical Bitcoin address of the wallet (P2WPKH)
     */
    readonly address: string;

    /**
     * The classical private key of the wallet (WIF format or hex)
     */
    readonly privateKey: string;

    /**
     * The classical public key of the wallet (hex)
     */
    readonly publicKey: string;

    /**
     * The quantum ML-DSA private key (hex)
     */
    readonly quantumPrivateKey: string;

    /**
     * The quantum ML-DSA public key (hex)
     */
    readonly quantumPublicKey: string;
}
