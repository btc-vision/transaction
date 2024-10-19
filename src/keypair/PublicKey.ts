import { Address } from '@btc-vision/bsi-binary';
import { Network } from 'bitcoinjs-lib';
import { EcKeyPair } from './EcKeyPair.js';
import { ECPairInterface } from 'ecpair';

export class PublicKey extends Uint8Array {
    private isP2TROnly: boolean = false;

    public constructor(length: number) {
        super(length);
    }

    private _keyPair: ECPairInterface | undefined;

    public get keyPair(): ECPairInterface {
        if (!this._keyPair) {
            throw new Error('Public key not set');
        }

        return this._keyPair;
    }

    public static wrap(publicKey: Address): PublicKey {
        const pubKey = new PublicKey(publicKey.length);
        pubKey.set(publicKey);

        return pubKey;
    }

    public override set(publicKey: ArrayLike<number>): void {
        if (publicKey.length !== 33 && publicKey.length !== 32 && publicKey.length !== 130) {
            throw new Error('Invalid public key length');
        }

        super.set(publicKey);

        if (publicKey.length === 32) {
            this.isP2TROnly = true;
        } else {
            this._keyPair = EcKeyPair.fromPublicKey(this);
        }
    }

    public p2wpkh(network: Network): string {
        return EcKeyPair.getP2WPKHAddress(this.keyPair, network);
    }

    public p2pkh(network: Network): string {
        return EcKeyPair.getLegacyAddress(this.keyPair, network);
    }

    public p2shp2wpkh(network: Network): string {
        return EcKeyPair.getLegacySegwitAddress(this.keyPair, network);
    }

    public p2tr(network: Network): string {
        if (this._keyPair) {
            return EcKeyPair.getTaprootAddress(this.keyPair, network);
        } else {
            return EcKeyPair.tweakedPubKeyBufferToAddress(this, network);
        }
    }

    private getExtendedKey(lowByte: number): Buffer {
        const newBuffer = Buffer.alloc(33);
        newBuffer.set(this, 1);
        newBuffer[0] = lowByte;

        return newBuffer;
    }
}
