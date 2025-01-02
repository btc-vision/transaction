import { TransactionType } from '../enums/TransactionType.js';
import { IChallengeSolutionTransactionParameters } from '../interfaces/ITransactionParameters.js';
import { getFinalScripts, opcodes, Psbt, PsbtInput, script, Signer } from '@btc-vision/bitcoin';
import { TransactionBuilder } from './TransactionBuilder.js';
import { ECPairInterface } from 'ecpair';

export class ChallengeSolutionTransaction extends TransactionBuilder<TransactionType.CHALLENGE_SOLUTION> {
    public readonly type: TransactionType.CHALLENGE_SOLUTION = TransactionType.CHALLENGE_SOLUTION;

    protected amount: bigint;
    protected readonly challengeSolution: Buffer;

    constructor(parameters: IChallengeSolutionTransactionParameters) {
        super(parameters);

        this.amount = parameters.amount;
        this.challengeSolution = parameters.challengeSolution;

        this.internalInit();
    }

    protected override async buildTransaction(): Promise<void> {
        if (!this.to) {
            throw new Error('Recipient address is required');
        }

        this.addInputsFromUTXO();

        if (this.isPubKeyDestination) {
            const pubKeyScript = script.compile([
                Buffer.from(this.to.replace('0x', ''), 'hex'),
                opcodes.OP_CHECKSIG,
            ]);

            this.addOutput({
                value: Number(this.amount),
                script: pubKeyScript,
            });
        } else {
            this.addOutput({
                value: Number(this.amount),
                address: this.to,
            });
        }

        await this.addRefundOutput(this.amount + this.addOptionalOutputsAndGetAmount());
    }

    protected override async signInput(
        transaction: Psbt,
        input: PsbtInput,
        i: number,
        signer: Signer | ECPairInterface,
        reverse: boolean = false,
        errored: boolean = false,
    ): Promise<void> {
        // do nothing.
    }

    protected override customFinalizerP2SH = (
        inputIndex: number,
        input: PsbtInput,
        scriptA: Buffer,
        isSegwit: boolean,
        isP2SH: boolean,
        isP2WSH: boolean,
    ): {
        finalScriptSig: Buffer | undefined;
        finalScriptWitness: Buffer | undefined;
    } => {
        const inputDecoded = this.inputs[inputIndex];
        
        if (isP2SH && inputDecoded && inputDecoded.redeemScript) {
            const scriptSig = script.compile([this.challengeSolution, inputDecoded.redeemScript]);

            return {
                finalScriptSig: scriptSig,
                finalScriptWitness: undefined,
            };
        }

        return getFinalScripts(inputIndex, input, scriptA, isSegwit, isP2SH, isP2WSH, false);
    };

    protected override getSignerKey(): Signer | ECPairInterface {
        return this.signer;
    }
}
