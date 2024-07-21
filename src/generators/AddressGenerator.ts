import { bech32 } from 'bech32';
import { initEccLib, Network } from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ripemd160 } from 'bitcoinjs-lib/src/crypto';

initEccLib(ecc);

export class AddressGenerator {
    // Generate a valid SegWit address from random bytes
    public static generatePKSH(sha256Hash: Buffer, network: Network): string {
        if (sha256Hash.length !== 32) throw new Error('Invalid hash length');

        const pkh = ripemd160(sha256Hash);
        return this.toSegwitAddress(pkh, network);
    }

    // Convert a hash to a SegWit address
    private static toSegwitAddress(pkh: Buffer, network: Network): string {
        const words = bech32.toWords(pkh);
        words.unshift(0x00); // Add the witness version byte (0x00 for P2WPKH)

        return bech32.encode(network.bech32, words);
    }
}
