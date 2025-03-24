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
    IChallengeSolutionTransactionParameters,
    IDeploymentParameters,
    IFundingTransactionParameters,
    IInteractionParameters,
    ITransactionParameters,
} from './interfaces/ITransactionParameters.js';
import { PSBTTypes } from './psbt/PSBTTypes.js';
import { ChallengeSolutionTransaction } from './builders/ChallengeSolutionTransaction.js';
import {
    IDeploymentParametersWithoutSigner,
    InteractionParametersWithoutSigner,
} from './browser/Web3Provider.js';
import { WindowWithWallets } from './browser/extensions/UnisatSigner.js';

export interface DeploymentResult {
    readonly transaction: [string, string];

    readonly contractAddress: string;
    readonly contractPubKey: string;
    readonly p2trAddress: string;

    readonly preimage: string;

    readonly utxos: UTXO[];
}

export interface FundingTransactionResponse {
    readonly tx: Transaction;
    readonly original: FundingTransaction;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
}

export interface ChallengeSolutionResponse {
    readonly tx: Transaction;
    readonly original: ChallengeSolutionTransaction;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
}

export interface BitcoinTransferBase {
    readonly tx: string;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
}

export interface InteractionResponse {
    readonly fundingTransaction: string;
    readonly interactionTransaction: string;
    readonly estimatedFees: bigint;
    readonly nextUTXOs: UTXO[];
    readonly preimage: string;
}

export interface ChallengeSolution extends BitcoinTransferBase {
    readonly original: ChallengeSolutionTransaction;
}

export interface BitcoinTransferResponse extends BitcoinTransferBase {
    readonly original: FundingTransaction;
}

export class TransactionFactory {
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

        const preTransaction: CustomScriptTransaction = new CustomScriptTransaction({
            ...interactionParameters,
            utxos: [interactionParameters.utxos[0]], // we simulate one input here.
        });

        // we don't sign that transaction, we just need the parameters.

        await preTransaction.generateTransactionMinimalSignatures();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        parameters.utxos = interactionParameters.utxos;
        parameters.amount =
            (await preTransaction.estimateTransactionFees()) +
            this.getPriorityFee(interactionParameters) +
            preTransaction.getOptionalOutputValue();

        const feeEstimationFundingTransaction = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!feeEstimationFundingTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        parameters.estimatedFees = feeEstimationFundingTransaction.estimatedFees;

        const signedTransaction = await this.createFundTransaction(parameters);
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        interactionParameters.utxos = this.getUTXOAsTransaction(
            signedTransaction.tx,
            interactionParameters.to,
            0,
        );

        const newParams: ICustomTransactionParameters = {
            ...interactionParameters,
            utxos: this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.to, 0), // always 0
            randomBytes: preTransaction.getRndBytes(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
            estimatedFees: preTransaction.estimatedFees,
        };

        const finalTransaction: CustomScriptTransaction = new CustomScriptTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = await finalTransaction.signTransaction();
        return [
            signedTransaction.tx.toHex(),
            outTx.toHex(),
            this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.from, 1), // always 1
        ];
    }

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

        // If OP_WALLET is used...
        const opWalletInteraction = await this.detectInteractionOPWallet(interactionParameters);
        if (opWalletInteraction) {
            return opWalletInteraction;
        }

        if (!('signer' in interactionParameters)) {
            throw new Error('Field "signer" not provided, OP_WALLET not detected.');
        }

        const inputs = this.parseOptionalInputs(interactionParameters.optionalInputs);
        const preTransaction: InteractionTransaction = new InteractionTransaction({
            ...interactionParameters,
            utxos: [interactionParameters.utxos[0]], // we simulate one input here.
            optionalInputs: inputs,
        });

        // we don't sign that transaction, we just need the parameters.
        await preTransaction.generateTransactionMinimalSignatures();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        parameters.utxos = interactionParameters.utxos;
        parameters.amount =
            (await preTransaction.estimateTransactionFees()) +
            this.getPriorityFee(interactionParameters) +
            preTransaction.getOptionalOutputValue();

        const feeEstimationFundingTransaction = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!feeEstimationFundingTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        parameters.estimatedFees = feeEstimationFundingTransaction.estimatedFees;

        const signedTransaction = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        interactionParameters.utxos = this.getUTXOAsTransaction(
            signedTransaction.tx,
            interactionParameters.to,
            0,
        );

        const newParams: IInteractionParameters = {
            ...interactionParameters,
            utxos: [
                ...this.getUTXOAsTransaction(signedTransaction.tx, interactionParameters.to, 0),
            ], // always 0
            randomBytes: preTransaction.getRndBytes(),
            preimage: preTransaction.getPreimage(),
            nonWitnessUtxo: signedTransaction.tx.toBuffer(),
            estimatedFees: preTransaction.estimatedFees,
            optionalInputs: inputs,
        };

        const finalTransaction: InteractionTransaction = new InteractionTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = await finalTransaction.signTransaction();
        return {
            fundingTransaction: signedTransaction.tx.toHex(),
            interactionTransaction: outTx.toHex(),
            estimatedFees: preTransaction.estimatedFees,
            nextUTXOs: this.getUTXOAsTransaction(
                signedTransaction.tx,
                interactionParameters.from,
                1,
            ), // always 1
            preimage: preTransaction.getPreimage().toString('hex'),
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
        const preTransaction: DeploymentTransaction = new DeploymentTransaction({
            ...deploymentParameters,
            utxos: [deploymentParameters.utxos[0]], // we simulate one input here.
            optionalInputs: inputs,
        });

        // we don't sign that transaction, we just need the parameters.
        await preTransaction.generateTransactionMinimalSignatures();

        const parameters: IFundingTransactionParameters =
            await preTransaction.getFundingTransactionParameters();

        parameters.utxos = deploymentParameters.utxos;
        parameters.amount =
            (await preTransaction.estimateTransactionFees()) +
            this.getPriorityFee(deploymentParameters) +
            preTransaction.getOptionalOutputValue();

        const feeEstimationFundingTransaction = await this.createFundTransaction({
            ...parameters,
            optionalOutputs: [],
            optionalInputs: [],
        });

        if (!feeEstimationFundingTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        parameters.estimatedFees = feeEstimationFundingTransaction.estimatedFees;

        const fundingTransaction: FundingTransaction = new FundingTransaction({
            ...parameters,
            optionalInputs: [],
            optionalOutputs: [],
        });

        const signedTransaction: Transaction = await fundingTransaction.signTransaction();
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        const out: TxOutput = signedTransaction.outs[0];
        const newUtxo: UTXO = {
            transactionId: signedTransaction.getId(),
            outputIndex: 0, // always 0
            scriptPubKey: {
                hex: out.script.toString('hex'),
                address: preTransaction.getScriptAddress(),
            },
            value: BigInt(out.value),
        };

        const newParams: IDeploymentParameters = {
            ...deploymentParameters,
            utxos: [newUtxo], // always 0
            randomBytes: preTransaction.getRndBytes(),
            preimage: preTransaction.getPreimage(),
            nonWitnessUtxo: signedTransaction.toBuffer(),
            estimatedFees: preTransaction.estimatedFees,
            optionalInputs: inputs,
        };

        const finalTransaction: DeploymentTransaction = new DeploymentTransaction(newParams);

        // We have to regenerate using the new utxo
        const outTx: Transaction = await finalTransaction.signTransaction();

        const out2: TxOutput = signedTransaction.outs[1];
        const refundUTXO: UTXO = {
            transactionId: signedTransaction.getId(),
            outputIndex: 1, // always 1
            scriptPubKey: {
                hex: out2.script.toString('hex'),
                address: deploymentParameters.from,
            },
            value: BigInt(out2.value),
        };

        return {
            transaction: [signedTransaction.toHex(), outTx.toHex()],
            contractAddress: finalTransaction.contractAddress.p2tr(deploymentParameters.network),
            contractPubKey: finalTransaction.contractPubKey,
            p2trAddress: finalTransaction.p2trAddress,
            utxos: [refundUTXO],
            preimage: preTransaction.getPreimage().toString('hex'),
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
     * @description Creates a challenge solution transaction.
     * @param {IChallengeSolutionTransactionParameters} parameters - The challenge solution transaction parameters
     * @returns {Promise<ChallengeSolution>} - The signed transaction
     */
    public async createChallengeSolution(
        parameters: IChallengeSolutionTransactionParameters,
    ): Promise<ChallengeSolution> {
        if (!parameters.from) {
            throw new Error('Field "from" not provided.');
        }

        const resp = await this._createChallengeSolution(parameters);
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

    private async _createChallengeSolution(
        parameters: IChallengeSolutionTransactionParameters,
    ): Promise<ChallengeSolutionResponse> {
        if (!parameters.to) throw new Error('Field "to" not provided.');

        const challengeTransaction: ChallengeSolutionTransaction = new ChallengeSolutionTransaction(
            parameters,
        );

        const signedTransaction: Transaction = await challengeTransaction.signTransaction();
        if (!signedTransaction) {
            throw new Error('Could not sign funding transaction.');
        }

        return {
            tx: signedTransaction,
            original: challengeTransaction,
            estimatedFees: challengeTransaction.estimatedFees,
            nextUTXOs: this.getUTXOAsTransaction(signedTransaction, parameters.to, 0),
        };
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

    private writePSBTHeader(type: PSBTTypes, psbt: string): string {
        const buf = Buffer.from(psbt, 'base64');

        const header = Buffer.alloc(2);
        header.writeUInt8(type, 0);
        header.writeUInt8(currentConsensus, 1);

        return Buffer.concat([header, buf]).toString('hex');
    }

    private getPriorityFee(params: ITransactionParameters): bigint {
        const totalFee = params.priorityFee + params.gasSatFee;
        if (totalFee < TransactionBuilder.MINIMUM_DUST) {
            return TransactionBuilder.MINIMUM_DUST;
        }

        return totalFee;
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
