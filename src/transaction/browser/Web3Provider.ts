import type { UTXO } from '../../utxo/interfaces/IUTXO.js';
import type {
    BitcoinTransferBase,
    CancelledTransaction,
    DeploymentResult,
    InteractionResponse,
} from '../interfaces/ITransactionResponses.js';
import type {
    BroadcastedTransaction,
    BroadcastTransactionOptions,
    ICancelTransactionParametersWithoutSigner,
    ICustomTransactionWithoutSigner,
    IDeploymentParametersWithoutSigner,
    IFundingTransactionParametersWithoutSigner,
    InteractionParametersWithoutSigner,
    MLDSASignature,
} from '../interfaces/IWeb3ProviderTypes.js';

export interface Web3Provider {
    /**
     * Build, sign, and broadcast a BTC funding transaction.
     * The wallet provides signer, network, and MLDSA internally.
     * The confirmation flow is handled by TxOpnetConfirmScreen.
     *
     * @param params - Funding transaction parameters (amount, to, feeRate, etc.)
     * @returns The BitcoinTransferBase with tx hex, fees, and UTXOs
     */
    sendBitcoin(
        params: IFundingTransactionParametersWithoutSigner,
    ): Promise<BitcoinTransferBase>;

    signInteraction(
        interactionParameters: InteractionParametersWithoutSigner,
    ): Promise<InteractionResponse>;

    signAndBroadcastInteraction(
        interactionParameters: InteractionParametersWithoutSigner,
    ): Promise<[BroadcastedTransaction, BroadcastedTransaction, UTXO[], string]>;

    cancelTransaction(
        params: ICancelTransactionParametersWithoutSigner,
    ): Promise<CancelledTransaction>;

    customTransaction(params: ICustomTransactionWithoutSigner): Promise<BroadcastedTransaction>;

    deployContract(params: IDeploymentParametersWithoutSigner): Promise<DeploymentResult>;

    broadcast(transactions: BroadcastTransactionOptions[]): Promise<BroadcastedTransaction[]>;

    /**
     * Sign a PSBT (Partially Signed Bitcoin Transaction).
     *
     * NOT IMPLEMENTED YET — will throw an error if called.
     */
    signPsbt(psbtHex: string, options?: object): Promise<string>;

    /**
     * Sign a message using Schnorr signature
     * @param message - Hexadecimal string message to sign
     * @returns The Schnorr signature in hex format
     * @throws {Error} If signing fails or wallet is not connected
     */
    signSchnorr(message: string): Promise<string>;

    /**
     * Get the ML-DSA public key for the current account
     *
     * @returns The ML-DSA public key in hex format (never exposes private keys)
     * @throws {Error} If the wallet is not connected
     */
    getMLDSAPublicKey(): Promise<string>;

    /**
     * Sign a message using ML-DSA signature
     *
     * @param message - The message to sign as a hexadecimal string
     * @returns The ML-DSA signature
     * @throws {Error} If signing fails or wallet is not connected
     */
    signMLDSAMessage(message: string): Promise<MLDSASignature>;

    /**
     * Verify an ML-DSA signature
     *
     * @param message - The original message, hexadecimal string
     * @param signature - The ML-DSA signature to verify
     * @returns True if the signature is valid
     */
    verifyMLDSASignature(message: string, signature: MLDSASignature): Promise<boolean>;
}
