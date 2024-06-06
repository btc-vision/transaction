import { IWallet } from '../keypair/interfaces/IWallet.js';
import { BlockchainConfig } from '@btc-vision/bsi-common';
export interface NetworkInformation {
    readonly wallet: IWallet;
    readonly config: BlockchainConfig;
}
