import { crypto as bitCrypto, Network, networks, Payment, payments } from '@btc-vision/bitcoin';
import { toXOnly } from '@btc-vision/bitcoin/src/psbt/bip371.js';
import { Taptree } from '@btc-vision/bitcoin/src/types.js';
import { DeploymentGenerator } from '../generators/builders/DeploymentGenerator.js';
import { TransactionBuilder } from '../transaction/builders/TransactionBuilder.js';
import { Address } from '../keypair/Address.js';

export interface ContractAddressVerificationParams {
    readonly deployerPubKey: Buffer;
    readonly contractSaltPubKey: Buffer;
    readonly originalSalt: Buffer;
    readonly bytecode: Buffer;
    readonly calldata?: Buffer;
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
            toXOnly(params.contractSaltPubKey),
            network,
        );

        const compiledTargetScript: Buffer = scriptBuilder.compile(
            params.bytecode,
            params.originalSalt,
            params.calldata,
        );

        const scriptTree: Taptree = [
            {
                output: compiledTargetScript,
                version: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
            {
                output: TransactionBuilder.LOCK_LEAF_SCRIPT,
                version: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
        ];

        return TapscriptVerificator.generateAddressFromScript(params, scriptTree);
    }

    public static verifyControlBlock(
        params: ContractAddressVerificationParams,
        controlBlock: Buffer,
    ): boolean {
        const network = params.network || networks.bitcoin;
        const scriptBuilder: DeploymentGenerator = new DeploymentGenerator(
            params.deployerPubKey,
            toXOnly(params.contractSaltPubKey),
            network,
        );

        const compiledTargetScript: Buffer = scriptBuilder.compile(
            params.bytecode,
            params.originalSalt,
            params.calldata,
        );

        const scriptTree: Taptree = [
            {
                output: compiledTargetScript,
                version: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
            {
                output: TransactionBuilder.LOCK_LEAF_SCRIPT,
                version: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
        ];

        const tapData = payments.p2tr({
            internalPubkey: toXOnly(params.deployerPubKey),
            network: network,
            scriptTree: scriptTree,
            redeem: {
                pubkeys: [params.deployerPubKey, params.contractSaltPubKey],
                output: compiledTargetScript,
                redeemVersion: TapscriptVerificator.TAP_SCRIPT_VERSION,
            },
        });

        const witness = tapData.witness;
        if (!witness || witness.length === 0) {
            return false;
        }

        const requiredControlBlock: Buffer = witness[witness.length - 1];
        return requiredControlBlock.equals(controlBlock);
    }

    public static getContractSeed(
        deployerPubKey: Buffer,
        bytecode: Buffer,
        saltHash: Buffer,
    ): Buffer {
        const sha256OfBytecode: Buffer = bitCrypto.hash256(bytecode);
        const buf: Buffer = Buffer.concat([deployerPubKey, saltHash, sha256OfBytecode]);

        return bitCrypto.hash256(buf);
    }

    public static generateContractVirtualAddress(
        deployerPubKey: Buffer,
        bytecode: Buffer,
        saltHash: Buffer,
        network: Network = networks.bitcoin,
    ): string {
        const virtualAddress: Buffer = TapscriptVerificator.getContractSeed(
            deployerPubKey,
            bytecode,
            saltHash,
        );

        const address = new Address(virtualAddress);

        return address.p2tr(network);
    }

    public static generateAddressFromScript(
        params: ContractAddressVerificationParams,
        scriptTree: Taptree,
    ): string | undefined {
        const network = params.network || networks.bitcoin;

        const transactionData: Payment = {
            internalPubkey: toXOnly(params.deployerPubKey),
            network: network,
            scriptTree: scriptTree,
        };

        const tx: Payment = payments.p2tr(transactionData);
        return tx.address;
    }
}
