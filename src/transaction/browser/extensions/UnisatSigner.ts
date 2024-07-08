import { CustomKeypair } from '../BrowserSignerBase.js';
import { Network, networks, Psbt } from 'bitcoinjs-lib';
import { PsbtSignatureOptions, Unisat, UnisatNetwork } from '../types/Unisat.js';
import { Address } from '@btc-vision/bsi-binary';
import { EcKeyPair } from '../../../keypair/EcKeyPair.js';
import { ECPairInterface } from 'ecpair';
import { TapScriptSig } from 'bip174/src/lib/interfaces.js';

declare global {
    interface Window {
        unisat?: Unisat;
    }
}

export class UnisatSigner extends CustomKeypair {
    private isInitialized: boolean = false;

    constructor() {
        super();

        if (!window) {
            throw new Error('UnisatSigner can only be used in a browser environment');
        }
    }

    private _p2tr: Address | undefined;

    public get p2tr(): Address {
        if (!this._p2tr) {
            throw new Error('P2TR address not set');
        }

        return this._p2tr;
    }

    private _p2pkh: Address | undefined;

    public get p2pkh(): Address {
        if (!this._p2pkh) {
            throw new Error('P2PKH address not set');
        }

        return this._p2pkh;
    }

    private _addresses: Address[] | undefined;

    public get addresses(): Address[] {
        if (!this._addresses) {
            throw new Error('Addresses not set');
        }

        return this._addresses;
    }

    private _publicKey: Buffer | undefined;

    public get publicKey(): Buffer {
        if (!this._publicKey) {
            throw new Error('Public key not set');
        }

        return this._publicKey;
    }

    public _network: Network | undefined;

    public get network(): Network {
        if (!this._network) {
            throw new Error('Network not set');
        }

        return this._network;
    }

    public get unisat(): Unisat {
        if (!window.unisat) {
            throw new Error('Unisat extension not found');
        }

        return window.unisat;
    }

    public async init(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        const network = await this.unisat.getNetwork();
        switch (network) {
            case UnisatNetwork.mainnet:
                this._network = networks.bitcoin;
                break;
            case UnisatNetwork.testnet:
                this._network = networks.testnet;
                break;
            case UnisatNetwork.regtest:
                this._network = networks.regtest;
                break;
            default:
                throw new Error('Invalid network');
        }

        const publicKey = await this.unisat.getPublicKey();
        this._publicKey = Buffer.from(publicKey, 'hex');

        this._p2pkh = EcKeyPair.getP2WPKHAddress(this as unknown as ECPairInterface, this.network);

        this._p2tr = EcKeyPair.getTaprootAddress(this as unknown as ECPairInterface, this.network);

        this._addresses = [this._p2pkh, this._p2tr];

        this.isInitialized = true;
    }

    public getPublicKey(): Buffer {
        if (!this.isInitialized) {
            throw new Error('UnisatSigner not initialized');
        }

        return this.publicKey;
    }

    public sign(hash: Buffer, lowR?: boolean): Buffer {
        throw new Error('Not implemented: sign');
    }

    public signSchnorr(hash: Buffer): Buffer {
        throw new Error('Not implemented: signSchnorr');
    }

    public verify(hash: Buffer, signature: Buffer): boolean {
        throw new Error('Not implemented: verify');
    }

    public async signTaprootInput(
        transaction: Psbt,
        i: number,
        sighashTypes: number[],
    ): Promise<void> {
        let firstSignature = await this.signTweaked(transaction, i, sighashTypes, false);
        this.combine(transaction, firstSignature, i);
    }

    public async signInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void> {
        const secondSignature = await this.signTweaked(transaction, i, sighashTypes, true);

        this.combine(transaction, secondSignature, i);
    }

    private combine(transaction: Psbt, newPsbt: Psbt, i: number): void {
        const signedInput = newPsbt.data.inputs[i];
        const originalInput = transaction.data.inputs[i];

        if (signedInput.partialSig) {
            transaction.updateInput(i, { partialSig: signedInput.partialSig });
        }

        if (signedInput.tapKeySig && !originalInput.tapKeySig) {
            transaction.updateInput(i, { tapKeySig: signedInput.tapKeySig });
        }

        if (signedInput.tapScriptSig?.length) {
            const lastScriptSig = originalInput.tapScriptSig;
            if (lastScriptSig) {
                const getNonDuplicate = this.getNonDuplicateScriptSig(
                    lastScriptSig,
                    signedInput.tapScriptSig,
                );

                if (getNonDuplicate.length) {
                    transaction.updateInput(i, { tapScriptSig: getNonDuplicate });
                }
            } else {
                transaction.updateInput(i, { tapScriptSig: signedInput.tapScriptSig });
            }
        }
    }

    private async signTweaked(
        transaction: Psbt,
        i: number,
        sighashTypes: number[],
        disableTweakSigner: boolean = false,
    ): Promise<Psbt> {
        const opts: PsbtSignatureOptions = {
            autoFinalized: false,
            toSignInputs: [
                {
                    index: i,
                    publicKey: this.publicKey.toString('hex'),
                    sighashTypes,
                    disableTweakSigner: disableTweakSigner,
                },
            ],
        };

        const psbt = transaction.toHex();
        const signed = await this.unisat.signPsbt(psbt, opts);

        return Psbt.fromHex(signed);
    }

    private getNonDuplicateScriptSig(
        scriptSig1: TapScriptSig[],
        scriptSig2: TapScriptSig[],
    ): TapScriptSig[] {
        const nonDuplicate: TapScriptSig[] = [];
        for (let i = 0; i < scriptSig2.length; i++) {
            const found = scriptSig1.find((item) => item.pubkey.equals(scriptSig2[i].pubkey));
            if (!found) {
                nonDuplicate.push(scriptSig2[i]);
            }
        }

        return nonDuplicate;
    }
}
