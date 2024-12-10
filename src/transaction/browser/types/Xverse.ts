export enum XverseNetwork {
    mainnet = 'mainnet',
    testnet = 'testnet',
    signet = 'Signet',
}

export type XverseRPCResponse<T = unknown> = {
    id: string;
    jsonrpc: string;
    result: T;
};

export type XverseRPCError = {
    id: string;
    jsonrpc: string;
    error: {
        code: number;
        message: string;
    };
};

export type XverseRPCGetAccountResponse =
    | XverseRPCResponse<{
          addresses: {
              address: string;
              addressType: string;
              publicKey: string;
              purpose: string; // ordinals, payment or stacks (we only care about payment)
          }[];
      }>
    | XverseRPCError;

export type XverseRPCSignPsbtResponse =
    | XverseRPCResponse<{
          psbt: string;
      }>
    | XverseRPCError;

interface InscriptionData {
    address: string;
    amount: number;
    asset: string;
    fee: number;
    nonce: number;
    recipient: string;
}

interface InscriptionResult {
    txid: string;
}

interface RepeatInscriptionsData {
    inscriptions: InscriptionData[];
}

interface TransactionResult {
    txid: string;
}

interface SignedMessageResult {
    signature: string;
}

interface BtcTransaction {
    inputs: {
        address: string;
        amount: number;
        asset: string;
        nonce: number;
    }[];
    outputs: {
        address: string;
        amount: number;
        asset: string;
    }[];
    fee: number;
}

interface SignedTransactionResult {
    txid: string;
    raw: string;
}

export interface Xverse {
    connect: () => Promise<void>;

    addListener: (event: string, callback: (...args: unknown[]) => void) => void;

    createInscription: (data: InscriptionData) => Promise<InscriptionResult>;

    createRepeatInscriptions: (data: RepeatInscriptionsData) => Promise<InscriptionResult[]>;

    request: (method: string, params: unknown) => Promise<XverseRPCResponse>;

    sendBtcTransaction: (transaction: BtcTransaction) => Promise<TransactionResult>;

    signMessage: (message: string) => Promise<SignedMessageResult>;

    signMultipleTransactions: (
        transactions: BtcTransaction[],
    ) => Promise<SignedTransactionResult[]>;

    signTransaction: (transaction: BtcTransaction) => Promise<SignedTransactionResult>;
}
