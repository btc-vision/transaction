export enum XverseNetwork {
    mainnet = 'mainnet',
    testnet = 'testnet',
    signet = 'Signet',
}

type XverseRPCResponse<T = unknown> =
    | {
          id: string;
          jsonrpc: string;
          result: T;
      }
    | {
          id: string;
          jsonrpc: string;
          error: {
              code: number;
              message: string;
          };
      };

type XverseRPCGetAccountResponse = XverseRPCResponse<{
    addresses: {
        address: string;
        addressType: string;
        publicKey: string;
        purpose: 'stacks' | 'payment' | 'ordinals'; // we only care about payment
    }[];
    walletType: string;
}>;

type XverseRPCSignPsbtResponse = XverseRPCResponse<{
    psbt: string;
}>;

type XverseRPCGetBalanceResponse = XverseRPCResponse<{
    confirmed: string;
    total: string;
    unconfirmed: string;
}>;

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
    request(method: string, params: unknown): Promise<XverseRPCResponse>;
    request(
        method: 'wallet_connect' | 'wallet_getAccount',
        params: null,
    ): Promise<XverseRPCGetAccountResponse>;
    request(method: 'wallet_disconnect', params: null): Promise<XverseRPCResponse<null>>;
    request(method: 'getBalance', params: null): Promise<XverseRPCGetBalanceResponse>;
    request(
        method: 'signPsbt',
        params: {
            psbt: string;
            signInputs:
                | {
                      [x: string]: number[];
                  }
                | undefined;
            broadcast: boolean;
        },
    ): Promise<XverseRPCSignPsbtResponse>;

    addListener: (event: string, callback: (...args: unknown[]) => void) => void;

    createInscription: (data: InscriptionData) => Promise<InscriptionResult>;
    createRepeatInscriptions: (data: RepeatInscriptionsData) => Promise<InscriptionResult[]>;

    sendBtcTransaction: (transaction: BtcTransaction) => Promise<TransactionResult>;

    signMessage: (message: string) => Promise<SignedMessageResult>;
    signMultipleTransactions: (
        transactions: BtcTransaction[],
    ) => Promise<SignedTransactionResult[]>;
    signTransaction: (transaction: BtcTransaction) => Promise<SignedTransactionResult>;
}
