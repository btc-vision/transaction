import { varuint } from '@btc-vision/bitcoin';

/**
 * Convert witness stack to script witness buffer
 * @param {Uint8Array[]} witness - The witness stack
 * @returns {Uint8Array}
 */
export function witnessStackToScriptWitness(witness: Uint8Array[]): Uint8Array {
    let buffer = new Uint8Array(0);

    function concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
        const result = new Uint8Array(a.length + b.length);
        result.set(a, 0);
        result.set(b, a.length);
        return result;
    }

    function writeSlice(slice: Uint8Array) {
        buffer = concatBuffers(buffer, slice);
    }

    function writeVarInt(i: number) {
        const currentLen = buffer.length;
        const varintLen = varuint.encodingLength(i);

        const newBuffer = new Uint8Array(currentLen + varintLen);
        newBuffer.set(buffer, 0);
        buffer = newBuffer;
        varuint.encode(i, buffer, currentLen);
    }

    function writeVarSlice(slice: Uint8Array) {
        writeVarInt(slice.length);
        writeSlice(slice);
    }

    function writeVector(vector: Uint8Array[]) {
        writeVarInt(vector.length);
        vector.forEach(writeVarSlice);
    }

    writeVector(witness);

    return buffer;
}
