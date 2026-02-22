import {
    type PsbtOutputExtended,
    type Script,
    toHex,
    toSatoshi,
    Transaction,
    type TxOutput,
} from '@btc-vision/bitcoin';
import type { UTXO } from '../utxo/interfaces/IUTXO.js';
import { CustomScriptTransaction } from './builders/CustomScriptTransaction.js';
import { DeploymentTransaction } from './builders/DeploymentTransaction.js';
import { FundingTransaction } from './builders/FundingTransaction.js';
import { InteractionTransaction } from './builders/InteractionTransaction.js';
import { TransactionBuilder } from './builders/TransactionBuilder.js';
import { TransactionType } from './enums/TransactionType.js';
import type {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
} from './interfaces/ITransactionParameters.js';
import type {
    ICancelTransactionParametersWithoutSigner,
    ICustomTransactionWithoutSigner,
    IDeploymentParametersWithoutSigner,
    InteractionParametersWithoutSigner,
} from './interfaces/IWeb3ProviderTypes.js';
import type { WindowWithWallets } from './browser/extensions/UnisatSigner.js';
import type { IChallengeSolution, RawChallenge } from '../epoch/interfaces/IChallengeSolution.js';
import { P2WDADetector } from '../p2wda/P2WDADetector.js';
import { InteractionTransactionP2WDA } from './builders/InteractionTransactionP2WDA.js';
import { Address } from '../keypair/Address.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';
import { CancelTransaction } from './builders/CancelTransaction.js';
import { ConsolidatedInteractionTransaction } from './builders/ConsolidatedInteractionTransaction.js';
import type { IConsolidatedInteractionParameters } from './interfaces/IConsolidatedTransactionParameters.js';
import type {
    CancelledTransaction,
    DeploymentResult,
    InteractionResponse,
} from './interfaces/ITransactionResponses.js';
import type { ICancelTransactionParameters } from './interfaces/ICancelTransactionParameters.js';
import type { ICustomTransactionParameters } from './interfaces/ICustomTransactionParameters.js';

export interface FundingTransactionResponse {
    readonly tx: Transaction;
    readonly original: FundingTransaction;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
    readonly inputUtxos: UTXO[];
}

export interface BitcoinTransferBase {
    readonly tx: string;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
    readonly inputUtxos: UTXO[];
}

export interface BitcoinTransferResponse extends BitcoinTransferBase {
    readonly original: FundingTransaction;
}

/**
 * Response from signConsolidatedInteraction.
 * Contains both setup and reveal transactions for the CHCT system.
 */
export interface ConsolidatedInteractionResponse {
    /** Setup transaction hex - creates P2WSH commitment outputs */
    readonly setupTransaction: string;
    /** Reveal transaction hex - spends commitments, reveals data in witnesses */
    readonly revealTransaction: string;
    /** Setup transaction ID */
    readonly setupTxId: string;
    /** Reveal transaction ID */
    readonly revealTxId: string;
    /** Total fees across both transactions in satoshis */
    readonly totalFees: bigint;
    /** Number of data chunks */
    readonly chunkCount: number;
    /** Total compiled data size in bytes */
    readonly dataSize: number;
    /** Challenge for the interaction */
    readonly challenge: RawChallenge;
    /** Input UTXOs used */
    readonly inputUtxos: UTXO[];
    /** Compiled target script (same as InteractionTransaction) */
    readonly compiledTargetScript: string;
}

export class TransactionFactory {
    public debug: boolean = false;

    private readonly DUMMY_PUBKEY = new Uint8Array(32).fill(1);
    private readonly P2TR_SCRIPT = Uint8Array.from([0x51, 0x20, ...this.DUMMY_PUBKEY]) as Script;
    private readonly INITIAL_FUNDING_ESTIMATE = 2000n;
    private readonly MAX_ITERATIONS = 10;

    /**
     * @description Creates a cancellable transaction.
     * @param {ICancelTransactionParameters | ICancelTransactionParametersWithoutSigner} params - The cancel transaction parameters
     * @returns {Promise<CancelledTransaction>} - The cancelled transaction result
     */
    public async createCancellableTransaction(
        params: ICancelTransactionParameters | ICancelTransactionParametersWithoutSigner,
    ): Promise<CancelledTransaction> {
        if (!params.to) {
            throw new Error('Field "to" not provided.');
        }

        if (!params.from) {
            throw new Error('Field "from" not provided.');
        }

        if (!params.utxos[0]) {
            throw new Error('Missing at least one UTXO.');
        }

        const opWalletCancel = await this.detectCancelOPWallet(params);
        if (opWalletCancel) {
            return opWalletCancel;
        }

        if (!('signer' in params)) {
            throw new Error('Field "signer" not provided, OP_WALLET not detected.');
        }

        const cancel = new CancelTransaction(params);
        const signed = await cancel.signTransaction();
        const rawTx = signed.toHex();

        return {
            transaction: rawTx,
            nextUTXOs: this.getUTXOAsTransaction(signed, params.from, 0),
            inputUtxos: params.utxos,
        };
    }

    /**
     * @description Generate a transaction with a custom script.
     * @param {ICustomTransactionParameters | ICustomTransactionWithoutSigner} interactionParameters - The custom transaction parameters
     * @returns {Promise<[string, string, UTXO[], UTXO[]]>} - The signed transaction tuple [fundingTx, customTx, nextUTXOs, inputUtxos]
     */
    public async createCustomScriptTransaction(
        interactionParameters: ICustomTransactionParameters | ICustomTransactionWithoutSigner,
    ): Promise<[string, string, UTXO[], UTXO[]]> {
        if (!interactionParameters.to) {
            throw new Error('Field "to" not provided.');
        }

        if (!interactionParameters.from) {
            throw new Error('Field "from" not provided.');
        }

        if (!interactionParameters.utxos[0]) {
            throw new Error('Missing at least one UTXO.');
        }

        if (!('signer' in interactionParameters)) {
            throw new Error('Field "signer" not provided, OP_WALLET not detected.');
        }

        const inputs = this.parseOptionalInputs(interactionParameters.optionalInputs);

        const { finalTransaction, estimatedAmount } = await this.iterateFundingAmount(
            { ...interactionParameters, optionalInputs: inputs },
            CustomScriptTransaction,
            async (tx) => {
                const fee = await tx.estimateTransactionFees();
                const priorityFee = this.getPriorityFee(interactionParameters);
                const optionalValue = tx.getOptionalOutputValue();
                return fee + priorityFee + optionalValue;
            },
            'CustomScript',
        );

        const parameters: IFundingTransactionParameters =
            await finalTransaction.getFundingTransactionParameters();

        parameters.utxos = interactionParameters.utxos;
        parameters.amount = estimatedAmount;

        const feeEstimationFunding = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!feeEstimationFunding) {
            throw new Error('Could not sign funding transaction.');
        }

        parameters.estimatedFees = feeEstimationFunding.estimatedFees;

        const signedTransaction = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const newParams: ICustomTransactionParameters = {
            ...interactionParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.to, 0),
            randomBytes: finalTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
            estimatedFees: finalTransaction.estimatedFees,
            compiledTargetScript: finalTransaction.exportCompiledTargetScript(),
            optionalInputs: inputs,
        };

        const customTransaction = new CustomScriptTransaction(newParams);
        const outTx = await customTransaction.signTransaction();

        return [
            signedTransaction.tx.toHex(),
            outTx.toHex(),
            this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.from, 1),
            interactionParameters.utxos,
        ];
    }

    /**
     * @description Generates the required transactions.
     * @param {IInteractionParameters | InteractionParametersWithoutSigner} interactionParameters - The interaction parameters
     * @returns {Promise<InteractionResponse>} - The signed transaction
     */
    public async signInteraction(
        interactionParameters: IInteractionParameters | InteractionParametersWithoutSigner,
    ): Promise<InteractionResponse> {
        if (!interactionParameters.to) {
            throw new Error('Field "to" not provided.');
        }

        if (!interactionParameters.from) {
            throw new Error('Field "from" not provided.');
        }

        if (!interactionParameters.utxos[0]) {
            throw new Error('Missing at least one UTXO.');
        }

        const opWalletInteraction = await this.detectInteractionOPWallet(interactionParameters);
        if (opWalletInteraction) {
            return opWalletInteraction;
        }

        if (!('signer' in interactionParameters)) {
            throw new Error('Field "signer" not provided, OP_WALLET not detected.');
        }

        const useP2WDA = this.hasP2WDAInputs(interactionParameters.utxos);
        if (useP2WDA) {
            return this.signP2WDAInteraction(interactionParameters);
        }

        const inputs = this.parseOptionalInputs(interactionParameters.optionalInputs);

        const { finalTransaction, estimatedAmount, challenge } = await this.iterateFundingAmount(
            { ...interactionParameters, optionalInputs: inputs },
            InteractionTransaction,
            async (tx) => {
                const fee = await tx.estimateTransactionFees();
                const outputsValue = tx.getTotalOutputValue();
                return fee + outputsValue;
            },
            'Interaction',
        );

        if (!challenge) {
            throw new Error('Failed to get challenge from interaction transaction');
        }

        const parameters: IFundingTransactionParameters =
            await finalTransaction.getFundingTransactionParameters();

        parameters.utxos = interactionParameters.utxos;
        parameters.amount = estimatedAmount;

        const feeEstimationFunding = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!feeEstimationFunding) {
            throw new Error('Could not sign funding transaction.');
        }

        parameters.estimatedFees = feeEstimationFunding.estimatedFees;

        const signedTransaction = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const fundingUTXO = this.getUTXOAsTransaction(
            signedTransaction.tx,
            finalTransaction.getScriptAddress(),
            0,
        );
        const newParams: IInteractionParameters = {
            ...interactionParameters,
            utxos: fundingUTXO,
            randomBytes: finalTransaction.getRndBytes(),
            challenge: challenge,
            compiledTargetScript: finalTransaction.exportCompiledTargetScript(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
            estimatedFees: finalTransaction.estimatedFees,
            optionalInputs: inputs,
        };

        const interactionTx = new InteractionTransaction(newParams);
        const outTx = await interactionTx.signTransaction();

        return {
            interactionAddress: finalTransaction.getScriptAddress(),
            fundingTransaction: signedTransaction.tx.toHex(),
            interactionTransaction: outTx.toHex(),
            estimatedFees: interactionTx.transactionFee,
            nextUTXOs: this.getUTXOAsTransaction(
                signedTransaction.tx,
                interactionParameters.from,
                1,
            ),
            challenge: challenge.toRaw(),
            fundingUTXOs: fundingUTXO,
            fundingInputUtxos: interactionParameters.utxos,
            compiledTargetScript: toHex(interactionTx.exportCompiledTargetScript()),
        };
    }

    /**
     * @description Generates a consolidated interaction transaction (CHCT system).
     *
     * Drop-in replacement for signInteraction that bypasses BIP110/Bitcoin Knots censorship.
     * Uses P2WSH with HASH160 commitments instead of Tapscript (which uses OP_IF and gets censored).
     *
     * Returns two transactions:
     * - Setup: Creates P2WSH outputs with hash commitments to data chunks
     * - Reveal: Spends those outputs, revealing data in witnesses
     *
     * Data integrity is consensus-enforced - if data is stripped/modified,
     * HASH160(data) != committed_hash and the transaction is INVALID.
     *
     * @param {IConsolidatedInteractionParameters} interactionParameters - Same parameters as signInteraction
     * @returns {Promise<ConsolidatedInteractionResponse>} - Both setup and reveal transactions
     */
    public async signConsolidatedInteraction(
        interactionParameters: IConsolidatedInteractionParameters,
    ): Promise<ConsolidatedInteractionResponse> {
        if (!interactionParameters.to) {
            throw new Error('Field "to" not provided.');
        }

        if (!interactionParameters.from) {
            throw new Error('Field "from" not provided.');
        }

        if (!interactionParameters.utxos[0]) {
            throw new Error('Missing at least one UTXO.');
        }

        if (!('signer' in interactionParameters)) {
            throw new Error('Field "signer" not provided.');
        }

        if (!interactionParameters.challenge) {
            throw new Error('Field "challenge" not provided.');
        }

        const inputs = this.parseOptionalInputs(interactionParameters.optionalInputs);

        const consolidatedTx = new ConsolidatedInteractionTransaction({
            ...interactionParameters,
            optionalInputs: inputs,
        });

        const result = await consolidatedTx.build();

        return {
            setupTransaction: result.setup.txHex,
            revealTransaction: result.reveal.txHex,
            setupTxId: result.setup.txId,
            revealTxId: result.reveal.txId,
            totalFees: result.totalFees,
            chunkCount: result.setup.chunkCount,
            dataSize: result.setup.totalDataSize,
            challenge: consolidatedTx.getChallenge().toRaw(),
            inputUtxos: interactionParameters.utxos,
            compiledTargetScript: toHex(consolidatedTx.exportCompiledTargetScript()),
        };
    }

    /**
     * @description Generates the required transactions.
     * @param {IDeploymentParameters} deploymentParameters - The deployment parameters
     * @returns {Promise<DeploymentResult>} - The signed transaction
     */
    public async signDeployment(
        deploymentParameters: IDeploymentParameters,
    ): Promise<DeploymentResult> {
        const opWalletDeployment = await this.detectDeploymentOPWallet(deploymentParameters);
        if (opWalletDeployment) {
            return opWalletDeployment;
        }

        if (!('signer' in deploymentParameters)) {
            throw new Error('Field "signer" not provided, OP_WALLET not detected.');
        }

        const inputs = this.parseOptionalInputs(deploymentParameters.optionalInputs);

        const { finalTransaction, estimatedAmount, challenge } = await this.iterateFundingAmount(
            { ...deploymentParameters, optionalInputs: inputs },
            DeploymentTransaction,
            async (tx) => {
                const fee = await tx.estimateTransactionFees();
                const priorityFee = this.getPriorityFee(deploymentParameters);
                const optionalValue = tx.getOptionalOutputValue();
                return fee + priorityFee + optionalValue;
            },
            'Deployment',
        );

        if (!challenge) {
            throw new Error('Failed to get challenge from deployment transaction');
        }

        const parameters: IFundingTransactionParameters =
            await finalTransaction.getFundingTransactionParameters();

        parameters.utxos = deploymentParameters.utxos;
        parameters.amount = estimatedAmount;

        const feeEstimationFunding = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!feeEstimationFunding) {
            throw new Error('Could not sign funding transaction.');
        }

        parameters.estimatedFees = feeEstimationFunding.estimatedFees;

        const fundingTransaction = new FundingTransaction({
            ...parameters,
            optionalInputs: [],
            optionalOutputs: [],
        });

        const signedTransaction = await fundingTransaction.signTransaction();
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const out = signedTransaction.outs[0] as TxOutput;
        const newUtxo: UTXO = {
            transactionId: signedTransaction.getId(),
            outputIndex: 0,
            scriptPubKey: {
                hex: toHex(out.script),
                address: finalTransaction.getScriptAddress(),
            },
            value: BigInt(out.value),
        };

        const newParams: IDeploymentParameters = {
            ...deploymentParameters,
            utxos: [newUtxo],
            randomBytes: finalTransaction.getRndBytes(),
            compiledTargetScript: finalTransaction.exportCompiledTargetScript(),
            challenge: challenge,
            nonWitnessUtxo: signedTransaction.toBuffer(),
            estimatedFees: finalTransaction.estimatedFees,
            optionalInputs: inputs,
        };

        const deploymentTx = new DeploymentTransaction(newParams);
        const outTx = await deploymentTx.signTransaction();

        const out2 = signedTransaction.outs[1] as TxOutput;
        const refundUTXO: UTXO = {
            transactionId: signedTransaction.getId(),
            outputIndex: 1,
            scriptPubKey: {
                hex: toHex(out2.script),
                address: deploymentParameters.from as string,
            },
            value: BigInt(out2.value),
        };

        return {
            transaction: [signedTransaction.toHex(), outTx.toHex()],
            contractAddress: deploymentTx.getContractAddress(),
            contractPubKey: deploymentTx.contractPubKey,
            utxos: [refundUTXO],
            challenge: challenge.toRaw(),
            inputUtxos: deploymentParameters.utxos,
        };
    }

    /**
     * @description Creates a funding transaction.
     * @param {IFundingTransactionParameters} parameters - The funding transaction parameters
     * @returns {Promise<BitcoinTransferResponse>} - The signed transaction
     */
    public async createBTCTransfer(
        parameters: IFundingTransactionParameters,
    ): Promise<BitcoinTransferResponse> {
        if (!parameters.from) {
            throw new Error('Field "from" not provided.');
        }

        const resp = await this.createFundTransaction(parameters);
        return {
            estimatedFees: resp.estimatedFees,
            original: resp.original,
            tx: resp.tx.toHex(),
            nextUTXOs: this.getAllNewUTXOs(resp.original, resp.tx, parameters.from),
            inputUtxos: parameters.utxos,
        };
    }

    /**
     * Get all new UTXOs of a generated transaction.
     * @param {TransactionBuilder<TransactionType>} original - The original transaction
     * @param {Transaction} tx - The transaction
     * @param {string} to - The address to filter
     * @returns {UTXO[]} - The new UTXOs belonging to the specified address
     */
    public getAllNewUTXOs(
        original: TransactionBuilder<TransactionType>,
        tx: Transaction,
        to: string,
    ): UTXO[] {
        const outputs = original.getOutputs();

        const utxos: UTXO[] = [];
        for (let i = 0; i < tx.outs.length; i++) {
            const output = outputs[i] as PsbtOutputExtended;
            if ('address' in output) {
                if (output.address !== to) continue;
            } else {
                continue;
            }

            utxos.push(...this.getUTXOAsTransaction(tx, to, i));
        }

        return utxos;
    }

    /**
     * Parse optional inputs and normalize nonWitnessUtxo format.
     * @param {UTXO[]} optionalInputs - The optional inputs to parse
     * @returns {UTXO[]} - The parsed inputs with normalized nonWitnessUtxo
     */
    private parseOptionalInputs(optionalInputs?: UTXO[]): UTXO[] {
        return (optionalInputs || []).map((input) => {
            let nonWitness = input.nonWitnessUtxo;
            if (
                nonWitness &&
                !(nonWitness instanceof Uint8Array) &&
                typeof nonWitness === 'object'
            ) {
                nonWitness = Uint8Array.from(Object.values(nonWitness as Record<string, number>));
            }

            return {
                ...input,
                nonWitnessUtxo: nonWitness,
            } as UTXO;
        });
    }

    /**
     * Detect and use OP_WALLET for cancel transactions if available.
     * @param {ICancelTransactionParameters | ICancelTransactionParametersWithoutSigner} interactionParameters - The cancel parameters
     * @returns {Promise<CancelledTransaction | null>} - The cancelled transaction or null if OP_WALLET not available
     */
    private async detectCancelOPWallet(
        interactionParameters:
            | ICancelTransactionParameters
            | ICancelTransactionParametersWithoutSigner,
    ): Promise<CancelledTransaction | null> {
        if (typeof window === 'undefined') {
            return null;
        }

        const _window = window as WindowWithWallets;
        if (!_window || !_window.opnet || !_window.opnet.web3) {
            return null;
        }

        const opnet = _window.opnet.web3;
        const interaction = await opnet.cancelTransaction({
            ...interactionParameters,
            // @ts-expect-error no, this is ok
            signer: undefined,
        });

        if (!interaction) {
            throw new Error('Could not sign interaction transaction.');
        }

        return {
            ...interaction,
            inputUtxos: interaction.inputUtxos ?? interactionParameters.utxos,
        };
    }

    /**
     * Detect and use OP_WALLET for interaction transactions if available.
     * @param {IInteractionParameters | InteractionParametersWithoutSigner} interactionParameters - The interaction parameters
     * @returns {Promise<InteractionResponse | null>} - The interaction response or null if OP_WALLET not available
     */
    private async detectInteractionOPWallet(
        interactionParameters: IInteractionParameters | InteractionParametersWithoutSigner,
    ): Promise<InteractionResponse | null> {
        if (typeof window === 'undefined') {
            return null;
        }

        const _window = window as WindowWithWallets;
        if (!_window || !_window.opnet || !_window.opnet.web3) {
            return null;
        }

        const opnet = _window.opnet.web3;
        const interaction = await opnet.signInteraction({
            ...interactionParameters,
            // @ts-expect-error no, this is ok
            signer: undefined,
        });

        if (!interaction) {
            throw new Error('Could not sign interaction transaction.');
        }

        return {
            ...interaction,
            fundingInputUtxos: interaction.fundingInputUtxos ?? interactionParameters.utxos,
        };
    }

    /**
     * Detect and use OP_WALLET for deployment transactions if available.
     * @param {IDeploymentParameters | IDeploymentParametersWithoutSigner} deploymentParameters - The deployment parameters
     * @returns {Promise<DeploymentResult | null>} - The deployment result or null if OP_WALLET not available
     */
    private async detectDeploymentOPWallet(
        deploymentParameters: IDeploymentParameters | IDeploymentParametersWithoutSigner,
    ): Promise<DeploymentResult | null> {
        if (typeof window === 'undefined') {
            return null;
        }

        const _window = window as WindowWithWallets;
        if (!_window || !_window.opnet || !_window.opnet.web3) {
            return null;
        }

        const opnet = _window.opnet.web3;
        const deployment = await opnet.deployContract({
            ...deploymentParameters,
            // @ts-expect-error no, this is ok
            signer: undefined,
        });

        if (!deployment) {
            throw new Error('Could not sign interaction transaction.');
        }

        return {
            ...deployment,
            inputUtxos: deployment.inputUtxos ?? deploymentParameters.utxos,
        };
    }

    /**
     * Create and sign a funding transaction.
     * @param {IFundingTransactionParameters} parameters - The funding transaction parameters
     * @returns {Promise<FundingTransactionResponse>} - The funding transaction response
     */
    private async createFundTransaction(
        parameters: IFundingTransactionParameters,
    ): Promise<FundingTransactionResponse> {
        if (!parameters.to) throw new Error('Field "to" not provided.');

        const fundingTransaction: FundingTransaction = new FundingTransaction(parameters);
        const signedTransaction: Transaction = await fundingTransaction.signTransaction();
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        return {
            tx: signedTransaction,
            original: fundingTransaction,
            estimatedFees: fundingTransaction.estimatedFees,
            nextUTXOs: this.getUTXOAsTransaction(signedTransaction, parameters.to, 0),
            inputUtxos: parameters.utxos,
        };
    }

    /**
     * Check if the UTXOs contain any P2WDA inputs
     *
     * This method examines both main UTXOs and optional inputs to determine
     * if any of them are P2WDA addresses. P2WDA detection is based on the
     * witness script pattern: (OP_2DROP * 5) <pubkey> OP_CHECKSIG
     *
     * @param {UTXO[]} utxos - The main UTXOs to check
     * @returns {boolean} - true if any UTXO is P2WDA, false otherwise
     */
    private hasP2WDAInputs(utxos: UTXO[]): boolean {
        return utxos.some((utxo) => P2WDADetector.isP2WDAUTXO(utxo));
    }

    /**
     * Sign a P2WDA interaction transaction
     *
     * P2WDA interactions are fundamentally different from standard OP_NET interactions.
     * Instead of using a two-transaction model (funding + interaction), P2WDA embeds
     * the operation data directly in the witness field of a single transaction.
     * This achieves significant cost savings through the witness discount.
     *
     * Key differences:
     * - Single transaction instead of two
     * - Operation data in witness field instead of taproot script
     * - 75% cost reduction for data storage
     * - No separate funding transaction needed
     *
     * @param {IInteractionParameters | InteractionParametersWithoutSigner} interactionParameters - The interaction parameters
     * @returns {Promise<InteractionResponse>} - The signed P2WDA interaction response
     */
    private async signP2WDAInteraction(
        interactionParameters: IInteractionParameters | InteractionParametersWithoutSigner,
    ): Promise<InteractionResponse> {
        if (!interactionParameters.from) {
            throw new Error('Field "from" not provided.');
        }

        if (!('signer' in interactionParameters)) {
            throw new Error(
                'P2WDA interactions require a signer. OP_WALLET is not supported for P2WDA.',
            );
        }

        const inputs = this.parseOptionalInputs(interactionParameters.optionalInputs);
        const p2wdaTransaction = new InteractionTransactionP2WDA({
            ...interactionParameters,
            optionalInputs: inputs,
        });

        const signedTx = await p2wdaTransaction.signTransaction();
        const txHex = signedTx.toHex();

        return {
            interactionAddress: null,
            fundingTransaction: null,
            interactionTransaction: txHex,
            estimatedFees: p2wdaTransaction.estimatedFees,
            nextUTXOs: this.getUTXOAsTransaction(
                signedTx,
                interactionParameters.from,
                signedTx.outs.length - 1,
            ),
            fundingUTXOs: [...interactionParameters.utxos, ...inputs],
            fundingInputUtxos: interactionParameters.utxos,
            challenge: interactionParameters.challenge.toRaw(),
            compiledTargetScript: null,
        };
    }

    /**
     * Get the priority fee from transaction parameters.
     * @param {ITransactionParameters} params - The transaction parameters
     * @returns {bigint} - The priority fee, minimum dust if below threshold
     */
    private getPriorityFee(params: ITransactionParameters): bigint {
        const totalFee = params.priorityFee + params.gasSatFee;
        if (totalFee < TransactionBuilder.MINIMUM_DUST) {
            return TransactionBuilder.MINIMUM_DUST;
        }

        return totalFee;
    }

    /**
     * Common iteration logic for finding the correct funding amount.
     *
     * This method iteratively estimates the required funding amount by simulating
     * transactions until the amount converges or max iterations is reached.
     *
     * @param {P extends IInteractionParameters | IDeploymentParameters | ICustomTransactionParameters} params - The transaction parameters
     * @param {new (params: P) => T} TransactionClass - The transaction class constructor
     * @param {(tx: T extends InteractionTransaction | DeploymentTransaction | CustomScriptTransaction) => Promise<bigint>} calculateAmount - Function to calculate required amount
     * @param {string} debugPrefix - Prefix for debug logging
     * @returns {Promise<{finalTransaction: T extends InteractionTransaction | DeploymentTransaction | CustomScriptTransaction, estimatedAmount: bigint, challenge: IChallengeSolution | null}>} - The final transaction and estimated amount
     */
    private async iterateFundingAmount<
        T extends InteractionTransaction | DeploymentTransaction | CustomScriptTransaction,
        P extends IInteractionParameters | IDeploymentParameters | ICustomTransactionParameters,
    >(
        params: P,
        TransactionClass: new (params: P) => T,
        calculateAmount: (tx: T) => Promise<bigint>,
        debugPrefix: string,
    ): Promise<{
        finalTransaction: T;
        estimatedAmount: bigint;
        challenge: IChallengeSolution | null;
    }> {
        const randomBytes =
            'randomBytes' in params
                ? (params.randomBytes ?? BitcoinUtils.rndBytes())
                : BitcoinUtils.rndBytes();

        const dummyAddress = Address.dead().p2tr(params.network);

        let estimatedFundingAmount = this.INITIAL_FUNDING_ESTIMATE;
        let previousAmount = 0n;
        let iterations = 0;
        let finalPreTransaction: T | null = null;
        let challenge: IChallengeSolution | null = null;

        while (iterations < this.MAX_ITERATIONS && estimatedFundingAmount !== previousAmount) {
            previousAmount = estimatedFundingAmount;

            const dummyTx = new Transaction();
            dummyTx.addOutput(this.P2TR_SCRIPT, toSatoshi(estimatedFundingAmount));

            const simulatedFundedUtxo: UTXO = {
                transactionId: toHex(new Uint8Array(32)),
                outputIndex: 0,
                scriptPubKey: {
                    hex: toHex(this.P2TR_SCRIPT),
                    address: dummyAddress,
                },
                value: estimatedFundingAmount,
                nonWitnessUtxo: dummyTx.toBuffer(),
            };

            let txParams: P;
            if ('challenge' in params && params.challenge) {
                const withChallenge = {
                    ...params,
                    utxos: [simulatedFundedUtxo],
                    randomBytes: randomBytes,
                    challenge: challenge ?? params.challenge,
                };
                txParams = withChallenge as P;
            } else {
                const withoutChallenge = {
                    ...params,
                    utxos: [simulatedFundedUtxo],
                    randomBytes: randomBytes,
                };
                txParams = withoutChallenge as P;
            }

            const preTransaction: T = new TransactionClass(txParams);

            try {
                await preTransaction.generateTransactionMinimalSignatures();
                estimatedFundingAmount = await calculateAmount(preTransaction);
            } catch (error: unknown) {
                if (error instanceof Error) {
                    const match = error.message.match(/need (\d+) sats but only have (\d+) sats/);
                    if (match) {
                        estimatedFundingAmount = BigInt(match[1] as string);
                        if (this.debug) {
                            console.log(
                                `${debugPrefix}: Caught insufficient funds, updating to ${estimatedFundingAmount}`,
                            );
                        }
                    } else {
                        throw error;
                    }
                } else {
                    throw new Error('Unknown error during fee estimation', { cause: error });
                }
            }

            finalPreTransaction = preTransaction;

            if (
                'getChallenge' in preTransaction &&
                typeof preTransaction.getChallenge === 'function'
            ) {
                challenge = preTransaction.getChallenge();
            }

            iterations++;

            if (this.debug) {
                console.log(
                    `${debugPrefix} Iteration ${iterations}: Previous=${previousAmount}, New=${estimatedFundingAmount}`,
                );
            }
        }

        if (!finalPreTransaction) {
            throw new Error(`Failed to converge on ${debugPrefix} funding amount`);
        }

        return {
            finalTransaction: finalPreTransaction,
            estimatedAmount: estimatedFundingAmount,
            challenge,
        };
    }

    /**
     * Convert a transaction output to a UTXO.
     * @param {Transaction} tx - The transaction
     * @param {string} to - The address
     * @param {number} index - The output index
     * @returns {UTXO[]} - The UTXO array (empty if output doesn't exist)
     */
    private getUTXOAsTransaction(tx: Transaction, to: string, index: number): UTXO[] {
        if (!tx.outs[index]) return [];

        const out: TxOutput = tx.outs[index];
        const newUtxo: UTXO = {
            transactionId: tx.getId(),
            outputIndex: index,
            scriptPubKey: {
                hex: toHex(out.script),
                address: to,
            },
            value: BigInt(out.value),
        };

        return [newUtxo];
    }
}
