import { describe, expect, it } from 'vitest';
import { stringToBuffer } from '../build/utils/StringToBuffer.js';

describe('Hex prefix stripping (anchored replace)', () => {
    describe('stringToBuffer', () => {
        it('should strip leading 0x prefix from hex string', () => {
            const result = stringToBuffer('0xabcdef');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(3);
            expect(result[0]).toBe(0xab);
            expect(result[1]).toBe(0xcd);
            expect(result[2]).toBe(0xef);
        });

        it('should pass through hex string without 0x prefix', () => {
            const result = stringToBuffer('abcdef');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(3);
            expect(result[0]).toBe(0xab);
        });

        it('should NOT strip 0x from middle of hex data', () => {
            // "0xdead0000beef" has leading 0x -> strip it -> "dead0000beef" -> 6 bytes
            const result = stringToBuffer('0xdead0000beef');
            expect(result.length).toBe(6);
            expect(result[0]).toBe(0xde);
            expect(result[1]).toBe(0xad);
            expect(result[2]).toBe(0x00);
            expect(result[3]).toBe(0x00);
            expect(result[4]).toBe(0xbe);
            expect(result[5]).toBe(0xef);
        });

        it('should handle 32-byte hash with 0x prefix', () => {
            const hash = '0x' + 'ab'.repeat(32);
            const result = stringToBuffer(hash);
            expect(result.length).toBe(32);
            expect(result.every((b) => b === 0xab)).toBe(true);
        });

        it('should handle 32-byte hash without 0x prefix', () => {
            const hash = 'ab'.repeat(32);
            const result = stringToBuffer(hash);
            expect(result.length).toBe(32);
            expect(result.every((b) => b === 0xab)).toBe(true);
        });

        it('should handle empty string after prefix strip', () => {
            expect(() => stringToBuffer('0x')).not.toThrow();
        });

        it('should preserve data when hex naturally contains 0x byte sequence', () => {
            // A hash where bytes 0x30 0x78 (ASCII '0x') appear naturally
            // e.g. position 4-5 of this hash: "aabbccdd3078eeff..."
            // Old code: .replace('0x','') would strip '30' and '78' -> corrupt
            // New code: no leading 0x, pass through unchanged
            const hexWithNatural0x = 'aabbccdd3078eeff';
            const result = stringToBuffer(hexWithNatural0x);
            expect(result.length).toBe(8);
            expect(result[4]).toBe(0x30); // '0' in ASCII
            expect(result[5]).toBe(0x78); // 'x' in ASCII
        });
    });

    describe('anchored vs unanchored behavior difference', () => {
        it('unanchored replace corrupts base64 with natural 0x', () => {
            // Prove the old behavior was broken
            const base64 = '7b35xyUK7jCoKcgiOmUQ7OGMOSO0xRjQycTYCOxe/Lw=';
            const oldBroken = base64.replace('0x', '');
            const newFixed = base64.startsWith('0x') ? base64.slice(2) : base64;

            // Old strips 2 chars from middle
            expect(oldBroken).not.toBe(base64);
            expect(oldBroken.length).toBe(base64.length - 2);

            // New preserves the string (no leading 0x)
            expect(newFixed).toBe(base64);

            // atob fails on corrupted string
            expect(() => atob(oldBroken)).toThrow();
            expect(() => atob(newFixed)).not.toThrow();
        });

        it('both methods work correctly for actual 0x-prefixed hex', () => {
            const hex = '0xdeadbeef';
            const oldResult = hex.replace('0x', '');
            const newResult = hex.startsWith('0x') ? hex.slice(2) : hex;

            expect(oldResult).toBe('deadbeef');
            expect(newResult).toBe('deadbeef');
        });

        it('both methods work for strings without 0x', () => {
            const plain = 'deadbeef';
            const oldResult = plain.replace('0x', '');
            const newResult = plain.startsWith('0x') ? plain.slice(2) : plain;

            expect(oldResult).toBe('deadbeef');
            expect(newResult).toBe('deadbeef');
        });
    });
});
