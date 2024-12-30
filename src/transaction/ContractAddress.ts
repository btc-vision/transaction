import { Address } from '../keypair/Address.js';
import { ProjectivePoint } from '@noble/secp256k1';

const SECP256K1_FIELD_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

export class ContractAddress {
    public static generatePubKeyFromHash(input: Buffer): Buffer {
        if (input.length !== 32) {
            throw new Error('Input must be exactly 32 bytes.');
        }

        // Convert input buffer to a bigint
        const inputAsBN = BigInt('0x' + input.toString('hex'));

        // Force x-coordinate to be >= P (invalid on secp256k1)
        const invalidX = SECP256K1_FIELD_P + inputAsBN;

        // Choose prefix byte 0x02 or 0x03 based on parity
        const prefix = invalidX % 2n === 0n ? 0x02 : 0x03;

        // Construct 33-byte compressed pubkey
        const pubKey = Buffer.alloc(33);
        pubKey[0] = prefix;

        // Convert invalidX to a 32-byte buffer
        // ensure it’s zero-padded to 32 bytes in hex
        const xHex = invalidX.toString(16).padStart(64, '0');
        pubKey.set(Buffer.from(xHex, 'hex'), 1);

        console.log(invalidX);

        return pubKey;
    }

    public static isValidContractAddress(address: Address | Buffer): boolean {
        if (address instanceof Address) {
            address = address.toBuffer();
        }

        try {
            ProjectivePoint.fromHex(address);
            return true;
        } catch (error) {
            // Any parse error or arithmetic mismatch means invalid
            return false;
        }
    }
}
