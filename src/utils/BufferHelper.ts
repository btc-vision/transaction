import { fromHex, toHex } from '@btc-vision/bitcoin';
import { U256_BYTE_LENGTH } from './lengths.js';
import type { MemorySlotPointer } from './types.js';

export class BufferHelper {
    public static readonly EXPECTED_BUFFER_LENGTH: number = 32;

    public static bufferToUint8Array(buffer: Uint8Array): Uint8Array {
        const result = new Uint8Array(buffer.byteLength);
        result.set(buffer);
        return result;
    }

    public static uint8ArrayToHex(input: Uint8Array): string {
        return toHex(input);
    }

    public static hexToUint8Array(input: string): Uint8Array {
        let hex = input;
        if (hex.length >= 2 && hex[0] === '0' && (hex[1] === 'x' || hex[1] === 'X')) {
            hex = hex.slice(2);
        }

        // Pad with a leading zero if the length is odd
        if (hex.length % 2 !== 0) {
            hex = '0' + hex;
        }

        return fromHex(hex);
    }

    public static pointerToUint8Array(pointer: MemorySlotPointer): Uint8Array {
        if (pointer < 0n) {
            throw new RangeError('Pointer cannot be negative');
        }

        const hex = pointer.toString(16).padStart(64, '0');
        if (hex.length > 64) {
            throw new RangeError('Pointer exceeds 256-bit range');
        }

        return fromHex(hex);
    }

    public static uint8ArrayToPointer(input: Uint8Array): MemorySlotPointer {
        if (input.length === 0) {
            return 0n;
        }

        return BigInt('0x' + toHex(input));
    }

    public static valueToUint8Array(value: bigint, length: number = U256_BYTE_LENGTH): Uint8Array {
        if (value < 0n) {
            throw new RangeError('Value cannot be negative');
        }

        const hex = value.toString(16).padStart(length * 2, '0');
        if (hex.length > length * 2) {
            throw new RangeError(`Value exceeds ${length}-byte range`);
        }

        return fromHex(hex);
    }

    public static uint8ArrayToValue(input: Uint8Array): bigint {
        if (input.length === 0) {
            return 0n;
        }

        return BigInt('0x' + toHex(input));
    }
}
