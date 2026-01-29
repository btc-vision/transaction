import { describe, expect, it } from 'vitest';
import { BufferHelper } from '../build/opnet.js';

describe('BufferHelper', () => {
    describe('bufferToUint8Array', () => {
        it('should convert a Buffer to Uint8Array', () => {
            const buf = Buffer.from([0x01, 0x02, 0x03]);
            const result = BufferHelper.bufferToUint8Array(buf);

            expect(result).toBeInstanceOf(Uint8Array);
            expect(result).not.toBeInstanceOf(Buffer);
            expect(Array.from(result)).toEqual([0x01, 0x02, 0x03]);
        });

        it('should convert a Uint8Array to a new Uint8Array', () => {
            const input = new Uint8Array([0xaa, 0xbb, 0xcc]);
            const result = BufferHelper.bufferToUint8Array(input);

            expect(result).toBeInstanceOf(Uint8Array);
            expect(Array.from(result)).toEqual([0xaa, 0xbb, 0xcc]);
            // Should be a copy, not the same reference
            expect(result).not.toBe(input);
        });

        it('should handle empty input', () => {
            const result = BufferHelper.bufferToUint8Array(new Uint8Array(0));

            expect(result.length).toBe(0);
        });
    });

    describe('uint8ArrayToHex', () => {
        it('should convert bytes to hex string', () => {
            const input = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
            const result = BufferHelper.uint8ArrayToHex(input);

            expect(result).toBe('deadbeef');
        });

        it('should handle single byte', () => {
            const result = BufferHelper.uint8ArrayToHex(new Uint8Array([0x0a]));

            expect(result).toBe('0a');
        });

        it('should handle empty array', () => {
            const result = BufferHelper.uint8ArrayToHex(new Uint8Array(0));

            expect(result).toBe('');
        });

        it('should handle all zeros', () => {
            const result = BufferHelper.uint8ArrayToHex(new Uint8Array(4));

            expect(result).toBe('00000000');
        });
    });

    describe('hexToUint8Array', () => {
        it('should convert hex string to Uint8Array', () => {
            const result = BufferHelper.hexToUint8Array('deadbeef');

            expect(Array.from(result)).toEqual([0xde, 0xad, 0xbe, 0xef]);
        });

        it('should strip 0x prefix', () => {
            const result = BufferHelper.hexToUint8Array('0xdeadbeef');

            expect(Array.from(result)).toEqual([0xde, 0xad, 0xbe, 0xef]);
        });

        it('should strip 0X prefix (uppercase)', () => {
            const result = BufferHelper.hexToUint8Array('0Xabcd');

            expect(Array.from(result)).toEqual([0xab, 0xcd]);
        });

        it('should pad odd-length hex with leading zero', () => {
            const result = BufferHelper.hexToUint8Array('abc');

            expect(Array.from(result)).toEqual([0x0a, 0xbc]);
        });

        it('should handle single character hex', () => {
            const result = BufferHelper.hexToUint8Array('f');

            expect(Array.from(result)).toEqual([0x0f]);
        });

        it('should handle empty string', () => {
            const result = BufferHelper.hexToUint8Array('');

            expect(result.length).toBe(0);
        });

        it('should handle 0x prefix with empty body', () => {
            const result = BufferHelper.hexToUint8Array('0x');

            expect(result.length).toBe(0);
        });
    });

    describe('hexToUint8Array / uint8ArrayToHex round-trip', () => {
        it('should round-trip arbitrary bytes', () => {
            const original = new Uint8Array([0x00, 0xff, 0x80, 0x01, 0x7f]);
            const hex = BufferHelper.uint8ArrayToHex(original);
            const restored = BufferHelper.hexToUint8Array(hex);

            expect(Array.from(restored)).toEqual(Array.from(original));
        });

        it('should round-trip 32-byte value', () => {
            const hex = 'ab'.repeat(32);
            const bytes = BufferHelper.hexToUint8Array(hex);
            const backToHex = BufferHelper.uint8ArrayToHex(bytes);

            expect(backToHex).toBe(hex);
            expect(bytes.length).toBe(32);
        });
    });

    describe('pointerToUint8Array', () => {
        it('should convert zero pointer to 32-byte zero array', () => {
            const result = BufferHelper.pointerToUint8Array(0n);

            expect(result.length).toBe(32);
            expect(Array.from(result)).toEqual(new Array(32).fill(0));
        });

        it('should convert pointer value 1 to right-padded array', () => {
            const result = BufferHelper.pointerToUint8Array(1n);

            expect(result.length).toBe(32);
            expect(result[31]).toBe(1);
            expect(result[0]).toBe(0);
        });

        it('should convert max u256 pointer', () => {
            const maxU256 = (1n << 256n) - 1n;
            const result = BufferHelper.pointerToUint8Array(maxU256);

            expect(result.length).toBe(32);
            expect(Array.from(result)).toEqual(new Array(32).fill(0xff));
        });

        it('should throw for negative pointer', () => {
            expect(() => BufferHelper.pointerToUint8Array(-1n)).toThrow('Pointer cannot be negative');
        });

        it('should throw for pointer exceeding 256-bit range', () => {
            const tooBig = 1n << 256n;
            expect(() => BufferHelper.pointerToUint8Array(tooBig)).toThrow(
                'Pointer exceeds 256-bit range',
            );
        });
    });

    describe('uint8ArrayToPointer', () => {
        it('should convert 32-byte zero array to 0n', () => {
            const result = BufferHelper.uint8ArrayToPointer(new Uint8Array(32));

            expect(result).toBe(0n);
        });

        it('should convert single byte to bigint', () => {
            const result = BufferHelper.uint8ArrayToPointer(new Uint8Array([0xff]));

            expect(result).toBe(255n);
        });

        it('should convert multi-byte value', () => {
            const result = BufferHelper.uint8ArrayToPointer(new Uint8Array([0x01, 0x00]));

            expect(result).toBe(256n);
        });

        it('should handle empty array', () => {
            const result = BufferHelper.uint8ArrayToPointer(new Uint8Array(0));

            expect(result).toBe(0n);
        });

        it('should round-trip with pointerToUint8Array', () => {
            const original = 123456789012345678901234567890n;
            const bytes = BufferHelper.pointerToUint8Array(original);
            const restored = BufferHelper.uint8ArrayToPointer(bytes);

            expect(restored).toBe(original);
        });

        it('should round-trip max u256', () => {
            const maxU256 = (1n << 256n) - 1n;
            const bytes = BufferHelper.pointerToUint8Array(maxU256);
            const restored = BufferHelper.uint8ArrayToPointer(bytes);

            expect(restored).toBe(maxU256);
        });
    });

    describe('valueToUint8Array', () => {
        it('should convert zero with default length (32 bytes)', () => {
            const result = BufferHelper.valueToUint8Array(0n);

            expect(result.length).toBe(32);
            expect(Array.from(result)).toEqual(new Array(32).fill(0));
        });

        it('should convert value 1 with default length', () => {
            const result = BufferHelper.valueToUint8Array(1n);

            expect(result.length).toBe(32);
            expect(result[31]).toBe(1);
        });

        it('should convert value with custom length', () => {
            const result = BufferHelper.valueToUint8Array(0xabcdn, 2);

            expect(result.length).toBe(2);
            expect(Array.from(result)).toEqual([0xab, 0xcd]);
        });

        it('should convert to 1-byte length', () => {
            const result = BufferHelper.valueToUint8Array(255n, 1);

            expect(result.length).toBe(1);
            expect(result[0]).toBe(0xff);
        });

        it('should throw for negative value', () => {
            expect(() => BufferHelper.valueToUint8Array(-1n)).toThrow('Value cannot be negative');
        });

        it('should throw when value exceeds specified length', () => {
            expect(() => BufferHelper.valueToUint8Array(256n, 1)).toThrow(
                'Value exceeds 1-byte range',
            );
        });

        it('should throw when value exceeds 32-byte range', () => {
            const tooBig = 1n << 256n;
            expect(() => BufferHelper.valueToUint8Array(tooBig)).toThrow(
                'Value exceeds 32-byte range',
            );
        });
    });

    describe('uint8ArrayToValue', () => {
        it('should convert single byte', () => {
            expect(BufferHelper.uint8ArrayToValue(new Uint8Array([0xff]))).toBe(255n);
        });

        it('should convert multi-byte big-endian', () => {
            expect(BufferHelper.uint8ArrayToValue(new Uint8Array([0x01, 0x00]))).toBe(256n);
        });

        it('should convert 32 zero bytes to 0n', () => {
            expect(BufferHelper.uint8ArrayToValue(new Uint8Array(32))).toBe(0n);
        });

        it('should handle empty array', () => {
            expect(BufferHelper.uint8ArrayToValue(new Uint8Array(0))).toBe(0n);
        });

        it('should round-trip with valueToUint8Array', () => {
            const original = 0xdeadbeefcafebabe1234567890n;
            const bytes = BufferHelper.valueToUint8Array(original);
            const restored = BufferHelper.uint8ArrayToValue(bytes);

            expect(restored).toBe(original);
        });

        it('should round-trip with custom length', () => {
            const original = 0xabcdn;
            const bytes = BufferHelper.valueToUint8Array(original, 8);
            const restored = BufferHelper.uint8ArrayToValue(bytes);

            expect(restored).toBe(original);
        });
    });

    describe('EXPECTED_BUFFER_LENGTH', () => {
        it('should be 32', () => {
            expect(BufferHelper.EXPECTED_BUFFER_LENGTH).toBe(32);
        });
    });
});
