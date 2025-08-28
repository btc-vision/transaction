import { Transaction, TxOutput } from '@btc-vision/bitcoin';
import { currentConsensus } from '../consensus/ConsensusConfig.js';
import { UTXO } from '../utxo/interfaces/IUTXO.js';
import {
    CustomScriptTransaction,
    ICustomTransactionParameters,
} from './builders/CustomScriptTransaction.js';
import { DeploymentTransaction } from './builders/DeploymentTransaction.js';
import { FundingTransaction } from './builders/FundingTransaction.js';
import { InteractionTransaction } from './builders/InteractionTransaction.js';
import { TransactionBuilder } from './builders/TransactionBuilder.js';
import { TransactionType } from './enums/TransactionType.js';
import {
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
} from './interfaces/ITransactionParameters.js';
import { PSBTTypes } from './psbt/PSBTTypes.js';
import {
    IDeploymentParametersWithoutSigner,
    InteractionParametersWithoutSigner,
} from './browser/Web3Provider.js';
import { WindowWithWallets } from './browser/extensions/UnisatSigner.js';
import { RawChallenge } from '../epoch/interfaces/IChallengeSolution.js';
import { P2WDADetector } from '../p2wda/P2WDADetector.js';
import { InteractionTransactionP2WDA } from './builders/InteractionTransactionP2WDA.js';
import { ChallengeSolution } from '../epoch/ChallengeSolution.js';
import { Address } from '../keypair/Address.js';
import { BitcoinUtils } from '../utils/BitcoinUtils.js';

export interface DeploymentResult {
    readonly transaction: [string, string];

    readonly contractAddress: string;
    readonly contractPubKey: string;
    readonly challenge: RawChallenge;

    readonly utxos: UTXO[];
}

export interface FundingTransactionResponse {
    readonly tx: Transaction;
    readonly original: FundingTransaction;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
}

export interface BitcoinTransferBase {
    readonly tx: string;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
}

export interface InteractionResponse {
    readonly fundingTransaction: string | null;
    readonly interactionTransaction: string;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
    readonly challenge: RawChallenge;
}

export interface BitcoinTransferResponse extends BitcoinTransferBase {
    readonly original: FundingTransaction;
}

export class TransactionFactory {
    public debug: boolean = false;

    private readonly DUMMY_PUBKEY = Buffer.alloc(32, 1);
    private readonly P2TR_SCRIPT = Buffer.concat([
        Buffer.from([0x51, 0x20]), // OP_1 + 32 bytes
        this.DUMMY_PUBKEY,
    ]);
    private readonly INITIAL_FUNDING_ESTIMATE = 2000n;
    private readonly MAX_ITERATIONS = 10;

    /**
     * @description Generate a transaction with a custom script.
     * @returns {Promise<[string, string]>} - The signed transaction
     */
    public async createCustomScriptTransaction(
        interactionParameters: ICustomTransactionParameters,
    ): Promise<[string, string, UTXO[]]> {
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

        // Use common iteration logic
        const { finalTransaction, estimatedAmount, challenge } = await this.iterateFundingAmount(
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

        // Create funding transaction
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
            optionalInputs: inputs,
        };

        const customTransaction = new CustomScriptTransaction(newParams);
        const outTx = await customTransaction.signTransaction();

        return [
            signedTransaction.tx.toHex(),
            outTx.toHex(),
            this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.from, 1),
        ];
    }

    /**
     * @description Generates the required transactions.
     * @returns {Promise<InteractionResponse>} - The signed transaction
     */
    /**
     * @description Generates the required transactions.
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

        // Use common iteration logic
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

        const newParams: IInteractionParameters = {
            ...interactionParameters,
            utxos: this.getUTXOAsTransaction(
                signedTransaction.tx,
                finalTransaction.getScriptAddress(),
                0,
            ),
            randomBytes: finalTransaction.getRndBytes(),
            challenge: challenge,
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
            estimatedFees: finalTransaction.estimatedFees,
            optionalInputs: inputs,
        };

        const interactionTx = new InteractionTransaction(newParams);
        const outTx = await interactionTx.signTransaction();

        return {
            fundingTransaction: signedTransaction.tx.toHex(),
            interactionTransaction: outTx.toHex(),
            estimatedFees: interactionTx.transactionFee,
            nextUTXOs: this.getUTXOAsTransaction(
                signedTransaction.tx,
                interactionParameters.from,
                1,
            ),
            challenge: challenge.toRaw(),
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

        // Use common iteration logic
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

        const out = signedTransaction.outs[0];
        const newUtxo: UTXO = {
            transactionId: signedTransaction.getId(),
            outputIndex: 0,
            scriptPubKey: {
                hex: out.script.toString('hex'),
                address: finalTransaction.getScriptAddress(),
            },
            value: BigInt(out.value),
        };

        const newParams: IDeploymentParameters = {
            ...deploymentParameters,
            utxos: [newUtxo],
            randomBytes: finalTransaction.getRndBytes(),
            challenge: challenge,
            nonWitnessUtxo: signedTransaction.toBuffer(),
            estimatedFees: finalTransaction.estimatedFees,
            optionalInputs: inputs,
        };

        const deploymentTx = new DeploymentTransaction(newParams);
        const outTx = await deploymentTx.signTransaction();

        const out2 = signedTransaction.outs[1];
        const refundUTXO: UTXO = {
            transactionId: signedTransaction.getId(),
            outputIndex: 1,
            scriptPubKey: {
                hex: out2.script.toString('hex'),
                address: deploymentParameters.from,
            },
            value: BigInt(out2.value),
        };

        return {
            transaction: [signedTransaction.toHex(), outTx.toHex()],
            contractAddress: deploymentTx.getContractAddress(),
            contractPubKey: deploymentTx.contractPubKey,
            utxos: [refundUTXO],
            challenge: challenge.toRaw(),
        };
    }

    /**
     * @description Creates a funding transaction.
     * @param {IFundingTransactionParameters} parameters - The funding transaction parameters
     * @returns {Promise<{ estimatedFees: bigint; tx: string }>} - The signed transaction
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
        };
    }

    /**
     * Get all new UTXOs of a generated transaction.
     * @param {TransactionBuilder<TransactionType>} original - The original transaction
     * @param {Transaction} tx - The transaction
     * @param {string} to - The address to filter
     */
    public getAllNewUTXOs(
        original: TransactionBuilder<TransactionType>,
        tx: Transaction,
        to: string,
    ): UTXO[] {
        const outputs = original.getOutputs();

        const utxos: UTXO[] = [];
        for (let i = 0; i < tx.outs.length; i++) {
            const output = outputs[i];
            if ('address' in output) {
                if (output.address !== to) continue;
            } else {
                continue;
            }

            utxos.push(...this.getUTXOAsTransaction(tx, to, i));
        }

        return utxos;
    }

    private parseOptionalInputs(optionalInputs?: UTXO[]): UTXO[] {
        return (optionalInputs || []).map((input) => {
            let nonWitness = input.nonWitnessUtxo;
            if (
                nonWitness &&
                !(nonWitness instanceof Uint8Array) &&
                typeof nonWitness === 'object'
            ) {
                nonWitness = Buffer.from(
                    Uint8Array.from(
                        Object.values(input.nonWitnessUtxo as unknown as Record<number, number>),
                    ),
                );
            }

            return {
                ...input,
                nonWitnessUtxo: nonWitness,
            };
        });
    }

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

        return interaction;
    }

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

        return deployment;
    }

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
        };
    }

    /**
     * Check if the UTXOs contain any P2WDA inputs
     *
     * This method examines both main UTXOs and optional inputs to determine
     * if any of them are P2WDA addresses. P2WDA detection is based on the
     * witness script pattern: (OP_2DROP * 5) <pubkey> OP_CHECKSIG
     *
     * @param utxos The main UTXOs to check
     * @returns true if any UTXO is P2WDA, false otherwise
     */
    private hasP2WDAInputs(utxos: UTXO[]): boolean {
        return utxos.some((utxo) => P2WDADetector.isP2WDAUTXO(utxo));
    }

    private writePSBTHeader(type: PSBTTypes, psbt: string): string {
        const buf = Buffer.from(psbt, 'base64');

        const header = Buffer.alloc(2);
        header.writeUInt8(type, 0);
        header.writeUInt8(currentConsensus, 1);

        return Buffer.concat([header, buf]).toString('hex');
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
     * @param interactionParameters The interaction parameters
     * @returns The signed P2WDA interaction response
     */
    private async signP2WDAInteraction(
        interactionParameters: IInteractionParameters | InteractionParametersWithoutSigner,
    ): Promise<InteractionResponse> {
        if (!interactionParameters.from) {
            throw new Error('Field "from" not provided.');
        }

        // Ensure we have a signer for P2WDA
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
            fundingTransaction: null,
            interactionTransaction: txHex,
            estimatedFees: p2wdaTransaction.estimatedFees,
            nextUTXOs: this.getUTXOAsTransaction(
                signedTx,
                interactionParameters.from,
                signedTx.outs.length - 1, // Last output is typically the change
            ),
            challenge: interactionParameters.challenge.toRaw(),
        };
    }

    private getPriorityFee(params: ITransactionParameters): bigint {
        const totalFee = params.priorityFee + params.gasSatFee;
        if (totalFee < TransactionBuilder.MINIMUM_DUST) {
            return TransactionBuilder.MINIMUM_DUST;
        }

        return totalFee;
    }

    /**
     * Common iteration logic for finding the correct funding amount
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
        challenge: ChallengeSolution | null;
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
        let challenge: ChallengeSolution | null = null;

        while (iterations < this.MAX_ITERATIONS && estimatedFundingAmount !== previousAmount) {
            previousAmount = estimatedFundingAmount;

            const dummyTx = new Transaction();
            dummyTx.addOutput(this.P2TR_SCRIPT, Number(estimatedFundingAmount));

            const simulatedFundedUtxo: UTXO = {
                transactionId: Buffer.alloc(32, 0).toString('hex'),
                outputIndex: 0,
                scriptPubKey: {
                    hex: this.P2TR_SCRIPT.toString('hex'),
                    address: dummyAddress,
                },
                value: estimatedFundingAmount,
                nonWitnessUtxo: dummyTx.toBuffer(),
            };

            // Build transaction params - TypeScript needs explicit typing here
            let txParams: P;
            if ('challenge' in params && params.challenge) {
                const withChallenge = {
                    ...params,
                    utxos: [simulatedFundedUtxo],
                    randomBytes: randomBytes,
                    challenge: challenge ?? params.challenge, // Use existing or original
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
                        estimatedFundingAmount = BigInt(match[1]);
                        if (this.debug) {
                            console.log(
                                `${debugPrefix}: Caught insufficient funds, updating to ${estimatedFundingAmount}`,
                            );
                        }
                    } else {
                        throw error;
                    }
                } else {
                    throw new Error('Unknown error during fee estimation');
                }
            }

            finalPreTransaction = preTransaction;

            // Extract challenge with explicit typing
            if (
                'getChallenge' in preTransaction &&
                typeof preTransaction.getChallenge === 'function'
            ) {
                const result = preTransaction.getChallenge();
                if (result instanceof ChallengeSolution) {
                    challenge = result;
                }
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

    private getUTXOAsTransaction(tx: Transaction, to: string, index: number): UTXO[] {
        if (!tx.outs[index]) return [];

        const out: TxOutput = tx.outs[index];
        const newUtxo: UTXO = {
            transactionId: tx.getId(),
            outputIndex: index,
            scriptPubKey: {
                hex: out.script.toString('hex'),
                address: to,
            },
            value: BigInt(out.value),
        };

        return [newUtxo];
    }
}
