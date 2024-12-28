import { Network, networks, Psbt, TapScriptSig } from '@btc-vision/bitcoin';
import { toXOnly } from '@btc-vision/bitcoin/src/psbt/bip371.js';
import { PartialSig } from 'bip174/src/lib/interfaces.js';
import { ECPairInterface } from 'ecpair';
import { EcKeyPair } from '../../../keypair/EcKeyPair.js';
import {
    canSignNonTaprootInput,
    isTaprootInput,
    pubkeyInScript,
} from '../../../signer/SignerUtils.js';
import { CustomKeypair } from '../BrowserSignerBase.js';
import { PsbtSignatureOptions } from '../types/Unisat.js';
import { Xverse } from '../types/Xverse.js';

declare global {
    interface Window {
        BitcoinProvider?: Xverse;
    }
}

export class XverseSigner extends CustomKeypair {
    private isInitialized: boolean = false;

    constructor() {
        super();

        if (!window) {
            throw new Error('XverseSigner can only be used in a browser environment');
        }
    }

    private _p2tr: string | undefined;

    public get p2tr(): string {
        if (!this._p2tr) {
            throw new Error('P2TR address not set');
        }

        return this._p2tr;
    }

    private _p2wpkh: string | undefined;

    public get p2wpkh(): string {
        if (!this._p2wpkh) {
            throw new Error('P2PKH address not set');
        }

        return this._p2wpkh;
    }

    private _addresses: string[] | undefined;

    public get addresses(): string[] {
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

    public get BitcoinProvider(): Xverse {
        const module = window.BitcoinProvider;
        if (!module) {
            throw new Error('Xverse Wallet extension not found');
        }

        return module;
    }

    public async init(): Promise<void> {
        if (this.isInitialized) return;

        const connectResult = await this.BitcoinProvider.request('wallet_connect', null);

        if ('error' in connectResult) throw new Error(connectResult.error.message);

        const payementAddress = connectResult.result.addresses.find(
            (address) => address.purpose === 'payment',
        );

        if (!payementAddress) {
            throw new Error('Payment address not found');
        }

        const network = payementAddress.address.startsWith('tb')
            ? networks.testnet
            : payementAddress.address.startsWith('bc')
              ? networks.bitcoin
              : null;

        if (!network) throw new Error('Network not supported');

        this._network = network;

        this._publicKey = Buffer.from(payementAddress.publicKey, 'hex');

        this._p2wpkh = EcKeyPair.getP2WPKHAddress(this as unknown as ECPairInterface, this.network);

        this._p2tr = EcKeyPair.getTaprootAddress(this as unknown as ECPairInterface, this.network);

        this._addresses = [this._p2wpkh, this._p2tr];

        this.isInitialized = true;
    }

    public getPublicKey(): Buffer {
        if (!this.isInitialized) {
            throw new Error('UnisatSigner not initialized');
        }

        return this.publicKey;
    }

    public sign(_hash: Buffer, _lowR?: boolean): Buffer {
        throw new Error('Not implemented: sign');
    }

    public signSchnorr(_hash: Buffer): Buffer {
        throw new Error('Not implemented: signSchnorr');
    }

    public verify(_hash: Buffer, _signature: Buffer): boolean {
        throw new Error('Not implemented: verify');
    }

    public async signTaprootInput(
        transaction: Psbt,
        i: number,
        sighashTypes: number[],
    ): Promise<void> {
        const input = transaction.data.inputs[i];
        if (
            input.tapKeySig ||
            input.finalScriptSig ||
            (Array.isArray(input.partialSig) &&
                input.partialSig.length &&
                this.hasAlreadyPartialSig(input.partialSig)) ||
            (Array.isArray(input.tapScriptSig) &&
                input.tapScriptSig.length &&
                this.hasAlreadySignedTapScriptSig(input.tapScriptSig))
        ) {
            return;
        }

        const firstSignature = await this.signAllTweaked(transaction, sighashTypes, false);
        this.combine(transaction, firstSignature, i);
    }

    public async signInput(transaction: Psbt, i: number, sighashTypes: number[]): Promise<void> {
        const input = transaction.data.inputs[i];
        if (
            input.tapKeySig ||
            input.finalScriptSig ||
            (Array.isArray(input.partialSig) &&
                input.partialSig.length &&
                this.hasAlreadyPartialSig(input.partialSig)) ||
            (Array.isArray(input.tapScriptSig) &&
                input.tapScriptSig.length &&
                this.hasAlreadySignedTapScriptSig(input.tapScriptSig))
        ) {
            return;
        }

        const firstSignature = await this.signAllTweaked(transaction, sighashTypes, true);
        this.combine(transaction, firstSignature, i);
    }

    public async multiSignPsbt(transactions: Psbt[]): Promise<void> {
        const toSignPsbts: string[] = [];
        const options: PsbtSignatureOptions[] = [];

        for (const psbt of transactions) {
            const hex = psbt.toBase64();
            toSignPsbts.push(hex);

            const toSignInputs = psbt.data.inputs
                .map((input, i) => {
                    let needsToSign = false;
                    let viaTaproot = false;

                    if (isTaprootInput(input)) {
                        if (input.tapLeafScript && input.tapLeafScript.length > 0) {
                            for (const tapLeafScript of input.tapLeafScript) {
                                if (pubkeyInScript(this.publicKey, tapLeafScript.script)) {
                                    needsToSign = true;
                                    viaTaproot = false; // for opnet, we use original keys.
                                    break;
                                }
                            }
                        }

                        if (!needsToSign && input.tapInternalKey) {
                            const tapInternalKey = input.tapInternalKey;
                            const xOnlyPubKey = toXOnly(this.publicKey);

                            if (tapInternalKey.equals(xOnlyPubKey)) {
                                needsToSign = true;
                                viaTaproot = true;
                            }
                        }
                    } else if (canSignNonTaprootInput(input, this.publicKey)) {
                        // Non-Taproot input
                        needsToSign = true;
                        viaTaproot = false;
                    }

                    if (needsToSign) {
                        return {
                            index: i,
                            publicKey: this.publicKey.toString('hex'),
                            disableTweakSigner: !viaTaproot,
                        };
                    } else {
                        return null;
                    }
                })
                .filter((v) => v !== null);

            options.push({
                autoFinalized: false,
                toSignInputs: toSignInputs,
            });
        }

        const toSignInputs: {
            [x: string]: number[];
        } = {
            [this.p2wpkh]: options[0].toSignInputs?.map((input) => input.index) || [],
        };

        const callSign = await this.BitcoinProvider.request('signPsbt', {
            psbt: toSignPsbts[0],
            signInputs: toSignInputs,
        });

        console.log(callSign);

        if ('error' in callSign) throw new Error(callSign.error.message);

        const signedPsbts = Psbt.fromBase64(callSign.result.psbt);

        transactions[0].combine(signedPsbts);
    }

    private hasAlreadySignedTapScriptSig(input: TapScriptSig[]): boolean {
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const buf = Buffer.from(item.pubkey);
            if (buf.equals(this.publicKey) && item.signature) {
                return true;
            }
        }

        return false;
    }

    private hasAlreadyPartialSig(input: PartialSig[]): boolean {
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const buf = Buffer.from(item.pubkey);
            if (buf.equals(this.publicKey) && item.signature) {
                return true;
            }
        }

        return false;
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

    private async signAllTweaked(
        transaction: Psbt,
        sighashTypes: number[],
        disableTweakSigner: boolean = false,
    ): Promise<Psbt> {
        const pubKey = this.publicKey.toString('hex');
        const toSign = transaction.data.inputs.map((_, i) => {
            return [
                {
                    index: i,
                    publicKey: pubKey,
                    sighashTypes,
                    disableTweakSigner: disableTweakSigner,
                },
            ];
        });

        const opts: PsbtSignatureOptions = {
            autoFinalized: false,
            toSignInputs: toSign.flat(),
        };

        const psbt = transaction.toBase64();

        const toSignInputs: {
            [x: string]: number[];
        } = {
            [this.p2wpkh]: opts.toSignInputs?.map((input) => input.index) || [],
        };

        const callSign = await this.BitcoinProvider.request('signPsbt', {
            psbt,
            signInputs: toSignInputs,
        });

        if ('error' in callSign) throw new Error(callSign.error.message);

        return Psbt.fromBase64(callSign.result.psbt);
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
