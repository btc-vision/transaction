import { bech32, bech32m } from 'bech32';
import { initEccLib, Network, ripemd160 } from '@btc-vision/bitcoin';
import * as ecc from '@bitcoinerlab/secp256k1';

initEccLib(ecc);

export class AddressGenerator {
    // Generate a valid SegWit address from random bytes
    public static generatePKSH(sha256Hash: Buffer, network: Network): string {
        if (sha256Hash.length !== 32) throw new Error('Invalid hash length');

        const pkh = ripemd160(sha256Hash);
        return this.toSegwitAddress(pkh, network);
    }

    // Generate a valid Taproot address from a public key
    public static generateTaprootAddress(pubKey: Buffer, network: { bech32: string }): string {
        if (pubKey.length !== 32) throw new Error('Invalid public key length');

        // Convert the public key to words
        const words = bech32m.toWords(pubKey);

        // Prepend the witness version (0x01 for Taproot)
        words.unshift(0x01);

        // Encode using Bech32m
        return bech32m.encode(network.bech32, words);
    }

    // Convert a hash to a SegWit address
    private static toSegwitAddress(pkh: Buffer, network: Network): string {
        const words = bech32.toWords(pkh);
        words.unshift(0x00); // Add the witness version byte (0x00 for P2WPKH)

        return bech32.encode(network.bech32, words);
    }
}
