import { Signer } from 'bitcoinjs-lib';
import { UTXO } from '../../utxo/interfaces/IUTXO.js';
import { Network } from 'bitcoinjs-lib/src/networks.js';
import { Address } from '@btc-vision/bsi-binary';

export interface ITransactionParameters {
    readonly from?: Address;
    readonly to: Address;
    utxos: UTXO[];

    readonly signer: Signer;
    readonly network: Network;
    readonly feeRate: number;
    readonly priorityFee: bigint;
}

export interface IFundingTransactionParameters extends ITransactionParameters {
    readonly childTransactionRequiredFees: bigint;
}

export interface IInteractionParameters extends ITransactionParameters {
    readonly calldata: Buffer;

    readonly pubKeys?: Buffer[];
    readonly minimumSignatures?: number;
}

export interface ITransactionDataContractInteractionWrap extends IInteractionParameters {
    readonly amount: bigint;
    readonly minimumSignatures: number;
    readonly pubKeys: Buffer[];
}

export interface ITransactionDataContractDeployment extends ITransactionParameters {
    readonly bytecode: Buffer;
    readonly salt: Buffer; // sha256

    readonly customSigner: Signer;
}
