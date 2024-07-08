import { Psbt, Transaction } from 'bitcoinjs-lib';
declare global {
    interface Window {
        unisat?: {};
    }
}
export declare class BrowserSigner {
    static signTransaction(transaction: Psbt): Promise<Transaction>;
}
