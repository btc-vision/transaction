import { decompressPublicKey } from '@btc-vision/bitcoin';

export class ContractAddress {
    public static generatePubKeyFromHash(input: Buffer): Buffer {
        if (input.length !== 32) {
            throw new Error('Input must be exactly 32 bytes.');
        }

        // Convert input buffer to a bigint
        const inputAsBN = BigInt('0x' + input.toString('hex'));

        // Choose prefix byte 0x02 or 0x03 based on parity
        const prefix = inputAsBN % 2n === 0n ? 0x02 : 0x03;

        // Construct 33-byte compressed pubkey
        const pubKey = Buffer.alloc(33);
        pubKey[0] = prefix;

        // ensure it’s zero-padded to 32 bytes in hex
        const xHex = inputAsBN.toString(16).padStart(64, '0');
        pubKey.set(Buffer.from(xHex, 'hex'), 1);

        return pubKey;
    }

    public static generateHybridKeyFromHash(input: Buffer): Buffer {
        const compressed = ContractAddress.generatePubKeyFromHash(input);

        return decompressPublicKey(compressed).hybrid;
    }
}
