import {
    crypto as bitCrypto,
    Network,
    networks,
    Psbt,
    script as bitScript,
    TapScriptSig,
    toXOnly,
} from '@btc-vision/bitcoin';
import { PartialSig } from 'bip174/src/lib/interfaces.js';
import { ECPairInterface } from 'ecpair';
import { EcKeyPair } from '../../../keypair/EcKeyPair.js';
import { canSignNonTaprootInput, isTaprootInput } from '../../../signer/SignerUtils.js';
import { CustomKeypair } from '../BrowserSignerBase.js';
import { PsbtSignatureOptions, SignatureType, Unisat } from '../types/Unisat.js';
import { WalletNetworks } from '../WalletNetworks.js';
import { OPWallet } from '../types/OPWallet.js';

export interface WindowWithWallets {
    unisat?: Unisat;
    opnet?: OPWallet;
}

export class UnisatSigner extends CustomKeypair {
    private isInitialized: boolean = false;

    constructor() {
        super();

        if (!window) {
            throw new Error('UnisatSigner can only be used in a browser environment');
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

    public get unisat(): Unisat {
        if (!window) throw new Error('Window not found');

        const module = (window as WindowWithWallets).unisat;
        if (!module) {
            throw new Error('Unisat extension not found');
        }

        return module;
    }

    public async signData(data: Buffer, type: SignatureType): Promise<Buffer> {
        const str = data.toString('hex');
        const signature = await this.unisat.signData(str, type);

        return Buffer.from(signature, 'hex');
    }

    public async init(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        const network = await this.unisat.getNetwork();
        switch (network) {
            case WalletNetworks.Mainnet:
                this._network = networks.bitcoin;
                break;
            case WalletNetworks.Testnet:
                this._network = networks.testnet;
                break;
            case WalletNetworks.Regtest:
                this._network = networks.regtest;
                break;
            default:
                throw new Error(`Invalid network: ${network}`);
        }

        const publicKey = await this.unisat.getPublicKey();
        if (publicKey === '') {
            throw new Error('Unlock your wallet first');
        }

        this._publicKey = Buffer.from(publicKey, 'hex');

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
            const hex = psbt.toHex();
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

        const signed = await this.unisat.signPsbt(toSignPsbts[0], options[0]);
        const signedPsbts = Psbt.fromHex(signed); //signed.map((hex) => Psbt.fromHex(hex));

        /*for (let i = 0; i < signedPsbts.length; i++) {
            const psbtOriginal = transactions[i];
            const psbtSigned = signedPsbts[i];

            psbtOriginal.combine(psbtSigned);
        }*/

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

function pubkeyInScript(pubkey: Buffer, script: Buffer): boolean {
    return pubkeyPositionInScript(pubkey, script) !== -1;
}

function pubkeyPositionInScript(pubkey: Buffer, script: Buffer): number {
    const pubkeyHash = bitCrypto.hash160(pubkey);
    const pubkeyXOnly = toXOnly(pubkey);

    const decompiled = bitScript.decompile(script);
    if (decompiled === null) throw new Error('Unknown script error');

    return decompiled.findIndex((element) => {
        if (typeof element === 'number') return false;
        return (
            Buffer.isBuffer(element) &&
            (element.equals(pubkey) || element.equals(pubkeyHash) || element.equals(pubkeyXOnly))
        );
    });
}
