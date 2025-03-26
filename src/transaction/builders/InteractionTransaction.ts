import { Taptree } from '@btc-vision/bitcoin';
import { TransactionType } from '../enums/TransactionType.js';
import { TapLeafScript } from '../interfaces/Tap.js';
import { IInteractionParameters } from '../interfaces/ITransactionParameters.js';
import { SharedInteractionTransaction } from './SharedInteractionTransaction.js';
import { Feature, Features } from '../../generators/Features.js';

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

        this.contractSecret = this.generateSecret();

        this.compiledTargetScript = this.calldataGenerator.compile(
            this.calldata,
            this.contractSecret,
            this.preimage,
            this.priorityFee,
            this.generateFeatures(parameters),
        );

        this.scriptTree = this.getScriptTree();
        this.internalInit();
    }

    private generateFeatures(parameters: IInteractionParameters): Feature<Features>[] {
        const features: Feature<Features>[] = [];

        if (parameters.loadedStorage) {
            features.push({
                opcode: Features.ACCESS_LIST,
                data: parameters.loadedStorage,
            });
        }

        return features;
    }
}
