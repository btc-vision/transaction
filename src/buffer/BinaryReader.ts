import { AddressMap } from '../deterministic/AddressMap.js';
import { Address } from '../keypair/Address.js';
import {
    ADDRESS_BYTE_LENGTH,
    I128_BYTE_LENGTH,
    U128_BYTE_LENGTH,
    U16_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    U8_BYTE_LENGTH,
} from '../utils/lengths.js';
import { BufferLike, i32, Selector, u16, u32, u8 } from '../utils/types.js';

export class BinaryReader {
    private buffer: DataView;
    private currentOffset: i32 = 0;

    constructor(bytes: BufferLike) {
        this.buffer = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    // Helpers for comparisons; unchanged
    public static stringCompare(a: string, b: string): number {
        return a.localeCompare(b);
    }

    public static bigintCompare(a: bigint, b: bigint): number {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }

    public static numberCompare(a: number, b: number): number {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }

    public setBuffer(bytes: BufferLike): void {
        this.buffer = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.currentOffset = 0;
    }

    public length(): number {
        return this.buffer.byteLength;
    }

    public bytesLeft(): number {
        return this.buffer.byteLength - this.currentOffset;
    }

    /**
     * Reads a single unsigned byte (u8).
     */
    public readU8(): u8 {
        this.verifyEnd(this.currentOffset + U8_BYTE_LENGTH);
        const value = this.buffer.getUint8(this.currentOffset);
        this.currentOffset += U8_BYTE_LENGTH;
        return value;
    }

    /**
     * Reads an unsigned 16-bit integer. By default, big-endian.
     * @param be - Endianness; true means big-endian (the default).
     */
    public readU16(be: boolean = true): u16 {
        this.verifyEnd(this.currentOffset + U16_BYTE_LENGTH);
        const value = this.buffer.getUint16(this.currentOffset, !be);
        this.currentOffset += U16_BYTE_LENGTH;
        return value;
    }

    /**
     * Reads an unsigned 32-bit integer. By default, big-endian.
     * @param be - Endianness; true means big-endian (the default).
     */
    public readU32(be: boolean = true): u32 {
        this.verifyEnd(this.currentOffset + U32_BYTE_LENGTH);
        const value = this.buffer.getUint32(this.currentOffset, !be);
        this.currentOffset += U32_BYTE_LENGTH;
        return value;
    }

    /**
     * Reads an unsigned 64-bit integer. By default, big-endian.
     * @param be - Endianness; true means big-endian (the default).
     */
    public readU64(be: boolean = true): bigint {
        this.verifyEnd(this.currentOffset + U64_BYTE_LENGTH);
        const value = this.buffer.getBigUint64(this.currentOffset, !be);
        this.currentOffset += U64_BYTE_LENGTH;
        return value;
    }

    /**
     * Reads a 128-bit unsigned integer. By default, read big-endian.
     * @param be - Endianness; true => big-endian (default).
     */
    public readU128(be: boolean = true): bigint {
        const raw = this.readBytes(U128_BYTE_LENGTH);
        let bytes = raw;
        // If data was written in little-endian, we reverse before interpreting
        if (!be) {
            bytes = this.reverseBytes(raw);
        }
        return BigInt('0x' + this.toHexString(bytes));
    }

    /**
     * Reads a 256-bit unsigned integer. Same approach as readU128.
     * @param be - Endianness; true => big-endian (default).
     */
    public readU256(be: boolean = true): bigint {
        const raw = this.readBytes(U256_BYTE_LENGTH);
        let bytes = raw;
        if (!be) {
            bytes = this.reverseBytes(raw);
        }
        return BigInt('0x' + this.toHexString(bytes));
    }

    /**
     * Reads a 128-bit signed integer. Interpret the sign bit if big-endian.
     * @param be - Endianness; true => big-endian (default).
     */
    public readI128(be: boolean = true): bigint {
        const raw = this.readBytes(I128_BYTE_LENGTH);
        let bytes = raw;
        if (!be) {
            bytes = this.reverseBytes(raw);
        }

        // Construct as a 128-bit two's complement
        let value = BigInt('0x' + this.toHexString(bytes));

        // If the top bit is set (sign bit in big-endian), interpret negative
        const signBitMask = 0x80;
        if (bytes[0] & signBitMask) {
            // (1 << 128)
            const twoTo128 = BigInt(1) << BigInt(128);
            // 2's complement
            value = value - twoTo128;
        }
        return value;
    }

    /**
     * Read a boolean (u8 != 0).
     */
    public readBoolean(): boolean {
        return this.readU8() !== 0;
    }

    /**
     * Reads 32 bits
     */
    public readSelector(): Selector {
        return this.readU32(true);
    }

    /**
     * Reads a raw sequence of bytes (length must be known).
     * If zeroStop = true, stops if we encounter 0x00 early.
     */
    public readBytes(length: u32, zeroStop: boolean = false): Uint8Array {
        this.verifyEnd(this.currentOffset + length);
        let bytes = new Uint8Array(length);

        for (let i: u32 = 0; i < length; i++) {
            const b = this.buffer.getUint8(this.currentOffset++);
            if (zeroStop && b === 0) {
                bytes = bytes.subarray(0, i);
                break;
            }
            bytes[i] = b;
        }
        return bytes;
    }

    /**
     * Reads a string of the given length in raw bytes. By default, do NOT zero-stop
     * (matching how we wrote the raw bytes).
     */
    public readString(length: u32): string {
        const textDecoder = new TextDecoder();
        const bytes = this.readBytes(length, false);
        return textDecoder.decode(bytes);
    }

    /**
     * Reads a string that was written as [u16 length][raw bytes].
     */
    public readStringWithLength(be: boolean = true): string {
        const length = this.readU32(be);
        return this.readString(length);
    }

    /**
     * Reads an address.
     */
    public readAddress(): Address {
        const bytes: u8[] = Array.from(this.readBytes(ADDRESS_BYTE_LENGTH));
        return new Address(bytes);
    }

    /**
     * Reads bytes written as [u32 length][bytes].
     * @param maxLength if > 0, enforces an upper bound
     * @param be
     */
    public readBytesWithLength(maxLength: number = 0, be: boolean = true): Uint8Array {
        const length = this.readU32(be);
        if (maxLength > 0 && length > maxLength) {
            throw new Error('Data length exceeds maximum length.');
        }

        return this.readBytes(length);
    }

    // ------------------ Array readers ------------------ //

    public readAddressArray(be: boolean = true): Address[] {
        const length = this.readU16(be);
        const result: Address[] = new Array<Address>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readAddress();
        }
        return result;
    }

    public readU256Array(be: boolean = true): bigint[] {
        const length = this.readU16(be);
        const result: bigint[] = new Array<bigint>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readU256(be);
        }
        return result;
    }

    public readU128Array(be: boolean = true): bigint[] {
        const length = this.readU16(be);
        const result: bigint[] = new Array<bigint>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readU128(be);
        }
        return result;
    }

    public readU64Array(be: boolean = true): bigint[] {
        const length = this.readU16(be);
        const result: bigint[] = new Array<bigint>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readU64(be);
        }
        return result;
    }

    public readU32Array(be: boolean = true): u32[] {
        const length = this.readU16(be);
        const result: u32[] = new Array<u32>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readU32(be);
        }
        return result;
    }

    public readU16Array(be: boolean = true): u16[] {
        const length = this.readU16(be);
        const result: u16[] = new Array<u16>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readU16(be);
        }
        return result;
    }

    public readU8Array(): u8[] {
        const length = this.readU16(true); // by default big-endian
        const result: u8[] = new Array<u8>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readU8();
        }
        return result;
    }

    public readStringArray(be: boolean = true): string[] {
        const length = this.readU16(be);
        const result: string[] = new Array<string>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readStringWithLength(be);
        }
        return result;
    }

    public readBytesArray(be: boolean = true): Uint8Array[] {
        const length = this.readU16(be);
        const result: Uint8Array[] = new Array<Uint8Array>(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readBytesWithLength(0, be);
        }
        return result;
    }

    /**
     * Reads [u16 length][ (address, u256) pairs ].
     */
    public readAddressValueTuple(be: boolean = true): AddressMap<bigint> {
        const length = this.readU16(be);
        const result = new AddressMap<bigint>();

        for (let i = 0; i < length; i++) {
            const address = this.readAddress();
            const value = this.readU256(be);

            if (result.has(address)) {
                throw new Error('Duplicate address found in map');
            }
            result.set(address, value);
        }
        return result;
    }

    // --------------------------------------------------- //

    public getOffset(): u16 {
        return this.currentOffset;
    }

    public setOffset(offset: u16): void {
        this.currentOffset = offset;
    }

    /**
     * Verifies we have enough bytes in the buffer to read up to `size`.
     */
    public verifyEnd(size: i32): void {
        if (size > this.buffer.byteLength) {
            throw new Error(
                `Attempt to read beyond buffer length: requested up to byte offset ${size}, but buffer is only ${this.buffer.byteLength} bytes.`,
            );
        }
    }

    /**
     * Utility: reverses a byte array in-place or returns a reversed copy.
     */
    private reverseBytes(bytes: Uint8Array): Uint8Array {
        const out = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            out[i] = bytes[bytes.length - 1 - i];
        }
        return out;
    }

    /**
     * Utility: turn bytes into a hex string without `0x` prefix.
     */
    private toHexString(bytes: Uint8Array): string {
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
}
