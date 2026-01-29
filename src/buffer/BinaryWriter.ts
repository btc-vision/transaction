import { AddressMap } from '../deterministic/AddressMap.js';
import { ExtendedAddressMap } from '../deterministic/ExtendedAddressMap.js';
import { Address } from '../keypair/Address.js';
import { BufferHelper } from '../utils/BufferHelper.js';
import {
    ADDRESS_BYTE_LENGTH,
    EXTENDED_ADDRESS_BYTE_LENGTH,
    I128_BYTE_LENGTH,
    I16_BYTE_LENGTH,
    I32_BYTE_LENGTH,
    I64_BYTE_LENGTH,
    I8_BYTE_LENGTH,
    SCHNORR_SIGNATURE_BYTE_LENGTH,
    U128_BYTE_LENGTH,
    U16_BYTE_LENGTH,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
    U8_BYTE_LENGTH,
} from '../utils/lengths.js';
import { i16, i32, i64, i8, Selector, u16, u32, u64, u8 } from '../utils/types.js';
import { BinaryReader } from './BinaryReader.js';

export class BinaryWriter implements Disposable {
    private currentOffset: u32 = 0;
    private buffer: DataView;

    constructor(length: number = 0) {
        this.buffer = this.getDefaultBuffer(length);
    }

    public static estimateArrayOfBufferLength(values: Uint8Array[]): u32 {
        if (values.length > 65535) throw new Error('Array size is too large');
        let totalLength: u32 = U16_BYTE_LENGTH;

        for (let i = 0; i < values.length; i++) {
            totalLength += U32_BYTE_LENGTH + values[i].length; // each entry has a u32 length prefix
        }

        return totalLength;
    }

    public writeU8(value: u8): void {
        if (value > 255) throw new Error('u8 value is too large.');

        this.allocSafe(U8_BYTE_LENGTH);
        this.buffer.setUint8(this.currentOffset++, value);
    }

    public writeU16(value: u16, be: boolean = true): void {
        if (value > 65535) throw new Error('u16 value is too large.');

        this.allocSafe(U16_BYTE_LENGTH);
        this.buffer.setUint16(this.currentOffset, value, !be);
        this.currentOffset += 2;
    }

    public writeU32(value: u32, be: boolean = true): void {
        if (value > 4294967295) throw new Error('u32 value is too large.');

        this.allocSafe(U32_BYTE_LENGTH);
        this.buffer.setUint32(this.currentOffset, value, !be);
        this.currentOffset += 4;
    }

    public writeU64(value: u64, be: boolean = true): void {
        if (value > 18446744073709551615n) throw new Error('u64 value is too large.');

        this.allocSafe(U64_BYTE_LENGTH);
        this.buffer.setBigUint64(this.currentOffset, value, !be);
        this.currentOffset += 8;
    }

    // ------------------- Signed Integer Writers ------------------- //

    /**
     * Writes a signed 8-bit integer.
     */
    public writeI8(value: i8): void {
        if (value < -128 || value > 127) throw new Error('i8 value is out of range.');

        this.allocSafe(I8_BYTE_LENGTH);
        this.buffer.setInt8(this.currentOffset, value);
        this.currentOffset += I8_BYTE_LENGTH;
    }

    /**
     * Writes a signed 16-bit integer. By default big-endian (be = true).
     */
    public writeI16(value: i16, be: boolean = true): void {
        if (value < -32768 || value > 32767) throw new Error('i16 value is out of range.');

        this.allocSafe(I16_BYTE_LENGTH);
        this.buffer.setInt16(this.currentOffset, value, !be);
        this.currentOffset += I16_BYTE_LENGTH;
    }

    /**
     * Writes a signed 32-bit integer. By default big-endian (be = true).
     */
    public writeI32(value: i32, be: boolean = true): void {
        if (value < -2147483648 || value > 2147483647)
            throw new Error('i32 value is out of range.');

        this.allocSafe(I32_BYTE_LENGTH);
        this.buffer.setInt32(this.currentOffset, value, !be);
        this.currentOffset += I32_BYTE_LENGTH;
    }

    /**
     * Writes a signed 64-bit integer. By default big-endian (be = true).
     */
    public writeI64(value: i64, be: boolean = true): void {
        if (value < -9223372036854775808n || value > 9223372036854775807n) {
            throw new Error('i64 value is out of range.');
        }

        this.allocSafe(I64_BYTE_LENGTH);
        this.buffer.setBigInt64(this.currentOffset, value, !be);
        this.currentOffset += I64_BYTE_LENGTH;
    }

    // ---------------------------------------------------------------- //

    public writeSelector(value: Selector): void {
        this.writeU32(value, true);
    }

    public writeBoolean(value: boolean): void {
        this.writeU8(value ? 1 : 0);
    }

    public writeI128(bigIntValue: bigint, be: boolean = true): void {
        if (
            bigIntValue > 170141183460469231731687303715884105727n ||
            bigIntValue < -170141183460469231731687303715884105728n
        ) {
            throw new Error('i128 value is too large.');
        }

        this.allocSafe(I128_BYTE_LENGTH);

        const bytesToHex = BufferHelper.valueToUint8Array(bigIntValue, I128_BYTE_LENGTH);
        if (bytesToHex.byteLength !== I128_BYTE_LENGTH) {
            throw new Error(`Invalid i128 value: ${bigIntValue}`);
        }

        if (be) {
            for (let i = 0; i < bytesToHex.byteLength; i++) {
                this.writeU8(bytesToHex[i]);
            }
        } else {
            for (let i = bytesToHex.byteLength - 1; i >= 0; i--) {
                this.writeU8(bytesToHex[i]);
            }
        }
    }

    public writeU256(bigIntValue: bigint, be: boolean = true): void {
        if (
            bigIntValue >
                115792089237316195423570985008687907853269984665640564039457584007913129639935n &&
            bigIntValue < 0n
        ) {
            throw new Error('u256 value is too large or negative.');
        }

        this.allocSafe(U256_BYTE_LENGTH);

        const bytesToHex = BufferHelper.valueToUint8Array(bigIntValue);
        if (bytesToHex.byteLength !== U256_BYTE_LENGTH) {
            throw new Error(`Invalid u256 value: ${bigIntValue}`);
        }

        if (be) {
            for (let i = 0; i < bytesToHex.byteLength; i++) {
                this.writeU8(bytesToHex[i]);
            }
        } else {
            for (let i = bytesToHex.byteLength - 1; i >= 0; i--) {
                this.writeU8(bytesToHex[i]);
            }
        }
    }

    public writeU128(bigIntValue: bigint, be: boolean = true): void {
        if (bigIntValue > 340282366920938463463374607431768211455n && bigIntValue < 0n) {
            throw new Error('u128 value is too large or negative.');
        }

        this.allocSafe(U128_BYTE_LENGTH);

        const bytesToHex = BufferHelper.valueToUint8Array(bigIntValue, U128_BYTE_LENGTH);
        if (bytesToHex.byteLength !== U128_BYTE_LENGTH) {
            throw new Error(`Invalid u128 value: ${bigIntValue}`);
        }

        if (be) {
            for (let i = 0; i < bytesToHex.byteLength; i++) {
                this.writeU8(bytesToHex[i]);
            }
        } else {
            for (let i = bytesToHex.byteLength - 1; i >= 0; i--) {
                this.writeU8(bytesToHex[i]);
            }
        }
    }

    public writeBytes(value: Uint8Array | Buffer): void {
        this.allocSafe(value.byteLength);

        for (let i = 0; i < value.byteLength; i++) {
            this.writeU8(value[i]);
        }
    }

    public writeString(value: string): void {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);

        this.allocSafe(bytes.length);
        this.writeBytes(bytes);
    }

    public writeStringWithLength(value: string): void {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);

        this.allocSafe(U32_BYTE_LENGTH + bytes.length);
        this.writeU32(bytes.length);
        this.writeBytes(bytes);
    }

    /**
     * Writes an address (32 bytes MLDSA key hash only).
     */
    public writeAddress(value: Address): void {
        this.verifyAddress(value);

        this.writeBytes(value);
    }

    /**
     * Writes the tweaked public key from an Address (32 bytes).
     * @param value - The Address containing the tweaked public key
     */
    public writeTweakedPublicKey(value: Address): void {
        const tweakedKey = value.tweakedPublicKeyToBuffer();
        this.allocSafe(ADDRESS_BYTE_LENGTH);
        this.writeBytes(tweakedKey);
    }

    /**
     * Writes a full address with both tweaked public key and MLDSA key hash (64 bytes total).
     * Format: [32 bytes tweakedPublicKey][32 bytes MLDSA key hash]
     *
     * This is the equivalent of btc-runtime's writeExtendedAddress().
     *
     * @param value - The Address containing both keys
     */
    public writeExtendedAddress(value: Address): void {
        this.allocSafe(EXTENDED_ADDRESS_BYTE_LENGTH);

        // Write tweaked public key first (32 bytes)
        this.writeTweakedPublicKey(value);

        // Write MLDSA key hash (32 bytes)
        this.writeBytes(value);
    }

    /**
     * Writes a Schnorr signature with its associated full Address.
     * Format: [64 bytes full Address][64 bytes signature]
     *
     * Used for serializing signed data where both the signer's address
     * and their Schnorr signature need to be stored together.
     *
     * @param address - The signer's Address (with both MLDSA and tweaked keys)
     * @param signature - The 64-byte Schnorr signature
     * @throws {Error} If signature is not exactly 64 bytes
     */
    public writeSchnorrSignature(address: Address, signature: Uint8Array): void {
        if (signature.length !== SCHNORR_SIGNATURE_BYTE_LENGTH) {
            throw new Error(
                `Invalid Schnorr signature length: expected ${SCHNORR_SIGNATURE_BYTE_LENGTH}, got ${signature.length}`,
            );
        }
        this.allocSafe(EXTENDED_ADDRESS_BYTE_LENGTH + SCHNORR_SIGNATURE_BYTE_LENGTH);
        this.writeExtendedAddress(address);
        this.writeBytes(signature);
    }

    public getBuffer(clear: boolean = true): Uint8Array {
        const buf = new Uint8Array(this.buffer.byteLength);
        for (let i: u32 = 0; i < this.buffer.byteLength; i++) {
            buf[i] = this.buffer.getUint8(i);
        }

        if (clear) this.clear();

        return buf;
    }

    public reset(): void {
        this.currentOffset = 0;
        this.buffer = this.getDefaultBuffer(4);
    }

    public toBytesReader(): BinaryReader {
        return new BinaryReader(this.getBuffer());
    }

    public getOffset(): u32 {
        return this.currentOffset;
    }

    public setOffset(offset: u32): void {
        this.currentOffset = offset;
    }

    public clear(): void {
        this.currentOffset = 0;
        this.buffer = this.getDefaultBuffer();
    }

    public [Symbol.dispose](): void {
        this.clear();
    }

    public allocSafe(size: u32): void {
        if (this.currentOffset + size > this.buffer.byteLength) {
            this.resize(size);
        }
    }

    public writeAddressValueTuple(map: AddressMap<bigint>, be: boolean = true): void {
        if (map.size > 65535) throw new Error('Map size is too large');

        this.writeU16(map.size, be);

        const keys = Array.from(map.keys());
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = map.get(key);

            if (value === null || value === undefined) throw new Error('Value not found');

            this.writeAddress(key);
            this.writeU256(value, be);
        }
    }

    /**
     * Writes a map of full Address -> u256 using the tweaked key for map lookup.
     * Format: [u16 length][FullAddress key][u256 value]...
     *
     * This is the equivalent of btc-runtime's writeExtendedAddressMapU256().
     */
    public writeExtendedAddressMapU256(map: ExtendedAddressMap<bigint>, be: boolean = true): void {
        if (map.size > 65535) throw new Error('Map size is too large');

        this.writeU16(map.size, be);

        for (const [key, value] of map.entries()) {
            this.writeExtendedAddress(key);
            this.writeU256(value, be);
        }
    }

    public writeBytesWithLength(value: Uint8Array): void {
        this.writeU32(value.length);
        this.writeBytes(value);
    }

    public writeArrayOfBuffer(values: Uint8Array[], be: boolean = true): void {
        const totalLength = BinaryWriter.estimateArrayOfBufferLength(values);

        this.allocSafe(totalLength);
        this.writeU16(values.length, be);

        for (let i = 0; i < values.length; i++) {
            this.writeU32(values[i].length, be);
            this.writeBytes(values[i]);
        }
    }

    public writeAddressArray(value: Address[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeAddress(value[i]);
        }
    }

    /**
     * Writes an array of full addresses (64 bytes each).
     * Format: [u16 length][FullAddress 0][FullAddress 1]...
     */
    public writeExtendedAddressArray(value: Address[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.allocSafe(U16_BYTE_LENGTH + value.length * EXTENDED_ADDRESS_BYTE_LENGTH);
        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeExtendedAddress(value[i]);
        }
    }

    public writeU32Array(value: u32[], be: boolean = true): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length, be);

        for (let i = 0; i < value.length; i++) {
            this.writeU32(value[i], be);
        }
    }

    public writeU256Array(value: bigint[], be: boolean = true): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length, be);

        for (let i = 0; i < value.length; i++) {
            this.writeU256(value[i], be);
        }
    }

    public writeU128Array(value: bigint[], be: boolean = true): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length, be);
        for (let i = 0; i < value.length; i++) {
            this.writeU128(value[i], be);
        }
    }

    public writeStringArray(value: string[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeStringWithLength(value[i]);
        }
    }

    public writeU16Array(value: u16[], be: boolean = true): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length, be);

        for (let i = 0; i < value.length; i++) {
            this.writeU16(value[i], be);
        }
    }

    public writeU8Array(value: u8[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeU8(value[i]);
        }
    }

    public writeU64Array(value: bigint[], be: boolean = true): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length, be);

        for (let i = 0; i < value.length; i++) {
            this.writeU64(value[i], be);
        }
    }

    public writeBytesArray(value: Uint8Array[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeBytesWithLength(value[i]);
        }
    }

    private verifyAddress(pubKey: Address): void {
        if (pubKey.byteLength > ADDRESS_BYTE_LENGTH) {
            throw new Error(
                `Address is too long ${pubKey.byteLength} > ${ADDRESS_BYTE_LENGTH} bytes`,
            );
        }
    }

    private resize(size: u32): void {
        const buf: Uint8Array = new Uint8Array(this.buffer.byteLength + size);
        for (let i: number = 0; i < this.buffer.byteLength; i++) {
            buf[i] = this.buffer.getUint8(i);
        }

        this.buffer = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    }

    private getDefaultBuffer(length: number = 0): DataView {
        return new DataView(new ArrayBuffer(length));
    }
}
