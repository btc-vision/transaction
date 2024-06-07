import { createHash } from 'crypto';
import { bech32 } from 'bech32';
import { initEccLib, Network } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

initEccLib(ecc);

export class AddressGenerator {
    // Generate a valid SegWit address from random bytes
    public static generatePKSH(sha256Hash: Buffer, network: Network): string {
        if (sha256Hash.length !== 32) throw new Error('Invalid hash length');

        const pkh = this.ripemd160(sha256Hash);
        return this.toSegwitAddress(pkh, network);
    }

    // Compute the RIPEMD-160 hash of a buffer
    private static ripemd160(data: Buffer): Buffer {
        return createHash('ripemd160').update(data).digest();
    }

    // Convert a hash to a SegWit address
    private static toSegwitAddress(pkh: Buffer, network: Network): string {
        const words = bech32.toWords(pkh);
        words.unshift(0x00); // Add the witness version byte (0x00 for P2WPKH)

        return bech32.encode(network.bech32, words);
    }
}
