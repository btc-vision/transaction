import {
    concat,
    crypto as bitCrypto,
    equals,
    Network,
    networks,
    opcodes,
    P2TRPayment,
    Payment,
    payments,
    PublicKey,
    script,
    Script,
    Taptree,
    toXOnly,
} from '@btc-vision/bitcoin';
import { DeploymentGenerator } from '../generators/builders/DeploymentGenerator.js';
import { IChallengeSolution } from '../epoch/interfaces/IChallengeSolution.js';
import { Feature, Features } from '../generators/Features.js';

export interface ContractAddressVerificationParams {
    readonly deployerPubKey: PublicKey;
    readonly contractSaltPubKey: Uint8Array;
    readonly originalSalt: Uint8Array;
    readonly bytecode: Uint8Array;
    readonly challenge: IChallengeSolution;
    readonly priorityFee: bigint;
    readonly features: Feature<Features>[];
    readonly calldata?: Uint8Array;
    readonly network?: Network;
}

export class TapscriptVerificator {
    private static readonly TAP_SCRIPT_VERSION: number = 192;

    public static getContractAddress(
        params: ContractAddressVerificationParams,
    ): string | undefined {
        const network = params.network || networks.bitcoin;
        const scriptBuilder: DeploymentGenerator = new DeploymentGenerator(
            params.deployerPubKey,
            toXOnly(params.contractSaltPubKey as PublicKey),
            network,
        );

        const compiledTargetScript: Uint8Array = scriptBuilder.compile(
            params.bytecode,
            params.originalSalt,
            params.challenge,
            params.priorityFee,
            params.calldata,
            params.features,
        );

        const lockLeafScript: Script = script.compile([
            toXOnly(params.deployerPubKey),
            opcodes.OP_CHECKSIG,
        ]);

        const scriptTree: Taptree = [
            {
                output: compiledTargetScript,
                version: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
            {
                output: lockLeafScript,
                version: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
        ];

        return TapscriptVerificator.generateAddressFromScript(params, scriptTree);
    }

    public static verifyControlBlock(
        params: ContractAddressVerificationParams,
        controlBlock: Uint8Array,
    ): boolean {
        const network = params.network || networks.bitcoin;
        const scriptBuilder: DeploymentGenerator = new DeploymentGenerator(
            params.deployerPubKey,
            toXOnly(params.contractSaltPubKey as PublicKey),
            network,
        );

        const compiledTargetScript: Uint8Array = scriptBuilder.compile(
            params.bytecode,
            params.originalSalt,
            params.challenge,
            params.priorityFee,
            params.calldata,
            params.features,
        );

        const lockLeafScript: Script = script.compile([
            toXOnly(params.deployerPubKey),
            opcodes.OP_CHECKSIG,
        ]);

        const scriptTree: Taptree = [
            {
                output: compiledTargetScript,
                version: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
            {
                output: lockLeafScript,
                version: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
        ];

        const tapData = payments.p2tr({
            internalPubkey: toXOnly(params.deployerPubKey),
            network: network,
            scriptTree: scriptTree,
            redeem: {
                output: compiledTargetScript as Script,
                redeemVersion: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
        });

        const witness = tapData.witness;
        if (!witness || witness.length === 0) {
            return false;
        }

        const requiredControlBlock: Uint8Array = witness[witness.length - 1];
        return equals(requiredControlBlock, controlBlock);
    }

    public static getContractSeed(
        deployerPubKey: Uint8Array,
        bytecode: Uint8Array,
        saltHash: Uint8Array,
    ): Uint8Array {
        const sha256OfBytecode: Uint8Array = bitCrypto.hash256(bytecode);
        const buf: Uint8Array = concat([deployerPubKey, saltHash, sha256OfBytecode]);

        return bitCrypto.hash256(buf);
    }

    public static generateAddressFromScript(
        params: ContractAddressVerificationParams,
        scriptTree: Taptree,
    ): string | undefined {
        const network = params.network || networks.bitcoin;

        const transactionData: Omit<P2TRPayment, 'name'> = {
            internalPubkey: toXOnly(params.deployerPubKey),
            network: network,
            scriptTree: scriptTree,
        };

        const tx: Payment = payments.p2tr(transactionData);
        return tx.address;
    }
}
