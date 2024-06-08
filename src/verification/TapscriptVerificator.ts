import { crypto as bitCrypto, Network, networks, Payment, payments } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
import { Taptree } from 'bitcoinjs-lib/src/types.js';
import { DeploymentGenerator } from '../generators/builders/DeploymentGenerator.js';
import { TransactionBuilder } from '../transaction/builders/TransactionBuilder.js';
import { AddressGenerator } from '../generators/AddressGenerator.js';

export interface ContractAddressVerificationParams {
    readonly deployerPubKeyXOnly: Buffer;
    readonly contractSaltPubKey: Buffer;
    readonly originalSalt: Buffer;
    readonly bytecode: Buffer;
    readonly network?: Network;
}

export class TapscriptVerificator {
    private static readonly TAP_SCRIPT_VERSION: number = 192;

    public static getContractAddress(
        params: ContractAddressVerificationParams,
    ): string | undefined {
        const network = params.network || networks.bitcoin;
        const scriptBuilder: DeploymentGenerator = new DeploymentGenerator(
            params.deployerPubKeyXOnly,
            toXOnly(params.contractSaltPubKey),
            network,
        );

        const compiledTargetScript: Buffer = scriptBuilder.compile(
            params.bytecode,
            params.originalSalt,
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

        return AddressGenerator.generatePKSH(virtualAddress, network);
    }

    public static generateAddressFromScript(
        params: ContractAddressVerificationParams,
        scriptTree: Taptree,
    ): string | undefined {
        const network = params.network || networks.bitcoin;

        const transactionData: Payment = {
            internalPubkey: params.deployerPubKeyXOnly,
            network: network,
            scriptTree: scriptTree,
        };

        const tx: Payment = payments.p2tr(transactionData);
        return tx.address;
    }
}
