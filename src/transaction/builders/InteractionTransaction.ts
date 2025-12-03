import { Taptree } from '@btc-vision/bitcoin';
import { TransactionType } from '../enums/TransactionType.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { Feature, FeaturePriority, Features } from '../../generators/Features.js';

/**
 * Class for interaction transactions
 * @class InteractionTransaction
 */
export class InteractionTransaction extends SharedInteractionTransaction<TransactionType.INTERACTION> {
    public type: TransactionType.INTERACTION = TransactionType.INTERACTION;

    protected readonly compiledTargetScript: Buffer;
    protected readonly scriptTree: Taptree;

    protected tapLeafScript: TapLeafScript | null = null;

    /**
     * Contract secret for the interaction
     * @protected
     */
    protected readonly contractSecret: Buffer;

    public constructor(parameters: IInteractionParameters) {
        super(parameters);

        if (!parameters.contract) {
            throw new Error('parameters.contract is required for interaction transaction.');
        }

        this.contractSecret = Buffer.from(parameters.contract.replace('0x', ''), 'hex');

        if (this.contractSecret.length !== 32) {
            throw new Error('Invalid contract secret length. Expected 32 bytes.');
        }

        if (parameters.compiledTargetScript) {
            if (Buffer.isBuffer(parameters.compiledTargetScript)) {
                this.compiledTargetScript = parameters.compiledTargetScript;
            } else if (typeof parameters.compiledTargetScript === 'string') {
                this.compiledTargetScript = Buffer.from(parameters.compiledTargetScript, 'hex');
            } else {
                throw new Error('Invalid compiled target script format.');
            }
        } else {
            this.compiledTargetScript = this.calldataGenerator.compile(
                this.calldata,
                this.contractSecret,
                this.challenge,
                this.priorityFee,
                this.generateFeatures(parameters),
            );
        }

        this.scriptTree = this.getScriptTree();
        this.internalInit();
    }

    private generateFeatures(parameters: IInteractionParameters): Feature<Features>[] {
        const features: Feature<Features>[] = [];

        if (parameters.loadedStorage) {
            features.push({
                priority: FeaturePriority.ACCESS_LIST,
                opcode: Features.ACCESS_LIST,
                data: parameters.loadedStorage,
            });
        }

        const submission = parameters.challenge.getSubmission();
        if (submission) {
            features.push({
                priority: FeaturePriority.EPOCH_SUBMISSION,
                opcode: Features.EPOCH_SUBMISSION,
                data: submission,
            });
        }

        if (parameters.revealMLDSAPublicKey && !parameters.linkMLDSAPublicKeyToAddress) {
            throw new Error(
                'To reveal the MLDSA public key, you must set linkMLDSAPublicKeyToAddress to true.',
            );
        }

        if (parameters.linkMLDSAPublicKeyToAddress) {
            this.generateMLDSALinkRequest(parameters, features);
        }

        return features;
    }
}
