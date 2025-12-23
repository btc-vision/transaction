import { varuint } from '@btc-vision/bitcoin';

/**
 * Convert witness stack to script witness buffer
 * @param {Buffer[]} witness - The witness stack
 * @returns {Buffer}
 */
export function witnessStackToScriptWitness(witness: Buffer[]): Buffer {
    let buffer = Buffer.allocUnsafe(0);

    function writeSlice(slice: Buffer) {
        buffer = Buffer.concat([buffer, Buffer.from(slice)]);
    }

    function writeVarInt(i: number) {
        const currentLen = buffer.length;
        const varintLen = varuint.encodingLength(i);

        buffer = Buffer.concat([buffer, Buffer.allocUnsafe(varintLen)]);
        varuint.encode(i, buffer, currentLen);
    }

    function writeVarSlice(slice: Buffer) {
        writeVarInt(slice.length);
        writeSlice(slice);
    }

    function writeVector(vector: Buffer[]) {
        writeVarInt(vector.length);
        vector.forEach(writeVarSlice);
    }

    writeVector(witness);

    return buffer;
}
