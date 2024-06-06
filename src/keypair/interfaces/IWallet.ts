/**
 * Interface for the generated wallet
 */
export interface IWallet {
    /**
     * The address of the wallet
     */
    readonly address: string;

    /**
     * The private key of the wallet
     */
    readonly privateKey: string;

    /**
     * The public key of the wallet
     */
    readonly publicKey: string;
}
