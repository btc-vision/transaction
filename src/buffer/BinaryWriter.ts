import { AddressMap } from '../deterministic/AddressMap.js';
import { Address } from '../keypair/Address.js';
import { BufferHelper } from '../utils/BufferHelper.js';
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
import { i32, Selector, u16, u32, u64, u8 } from '../utils/types.js';
import { BinaryReader } from './BinaryReader.js';

export class BinaryWriter {
    private currentOffset: u32 = 0;
    private buffer: DataView;

    constructor(length: number = 0) {
        this.buffer = this.getDefaultBuffer(length);
    }

    public writeU8(value: u8): void {
        if (value > 255) throw new Error('u8 value is too large.');

        this.allocSafe(U8_BYTE_LENGTH);
        this.buffer.setUint8(this.currentOffset++, value);
    }

    public writeU16(value: u16): void {
        if (value > 65535) throw new Error('u16 value is too large.');

        this.allocSafe(U16_BYTE_LENGTH);
        this.buffer.setUint16(this.currentOffset, value, true);
        this.currentOffset += 2;
    }

    public writeU32(value: u32, le: boolean = true): void {
        if (value > 4294967295) throw new Error('u32 value is too large.');

        this.allocSafe(U32_BYTE_LENGTH);
        this.buffer.setUint32(this.currentOffset, value, le);
        this.currentOffset += 4;
    }

    public writeU64(value: u64): void {
        if (value > 18446744073709551615n) throw new Error('u64 value is too large.');

        this.allocSafe(U64_BYTE_LENGTH);
        this.buffer.setBigUint64(this.currentOffset, value, true);
        this.currentOffset += 8;
    }

    public writeSelector(value: Selector): void {
        this.writeU32(value, false);
    }

    public writeBoolean(value: boolean): void {
        this.writeU8(value ? 1 : 0);
    }

    public writeI128(bigIntValue: bigint): void {
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

        for (let i = 0; i < bytesToHex.byteLength; i++) {
            this.writeU8(bytesToHex[i]);
        }
    }

    public writeU256(bigIntValue: bigint): void {
        if (
            bigIntValue >
            115792089237316195423570985008687907853269984665640564039457584007913129639935n
        ) {
            throw new Error('u256 value is too large.');
        }

        this.allocSafe(U256_BYTE_LENGTH);

        const bytesToHex = BufferHelper.valueToUint8Array(bigIntValue);
        if (bytesToHex.byteLength !== U256_BYTE_LENGTH) {
            throw new Error(`Invalid u256 value: ${bigIntValue}`);
        }

        for (let i = 0; i < bytesToHex.byteLength; i++) {
            this.writeU8(bytesToHex[i]);
        }
    }

    public writeU128(bigIntValue: bigint): void {
        if (bigIntValue > 340282366920938463463374607431768211455n) {
            throw new Error('u128 value is too large.');
        }

        this.allocSafe(U128_BYTE_LENGTH);

        const bytesToHex = BufferHelper.valueToUint8Array(bigIntValue, U128_BYTE_LENGTH);
        if (bytesToHex.byteLength !== U128_BYTE_LENGTH) {
            throw new Error(`Invalid u128 value: ${bigIntValue}`);
        }

        for (let i = 0; i < bytesToHex.byteLength; i++) {
            this.writeU8(bytesToHex[i]);
        }
    }

    public writeBytes(value: Uint8Array | Buffer): void {
        this.allocSafe(value.byteLength);

        for (let i = 0; i < value.byteLength; i++) {
            this.writeU8(value[i]);
        }
    }

    public writeString(value: string): void {
        this.allocSafe(value.length);

        for (let i: i32 = 0; i < value.length; i++) {
            this.writeU8(value.charCodeAt(i));
        }
    }

    public writeAddress(value: Address): void {
        this.verifyAddress(value);

        this.writeBytes(value);
    }

    public writeStringWithLength(value: string): void {
        this.allocSafe(U16_BYTE_LENGTH + value.length);

        this.writeU16(value.length);
        this.writeString(value);
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

    public writeTuple(values: bigint[]): void {
        this.allocSafe(U32_BYTE_LENGTH + values.length * U256_BYTE_LENGTH);
        this.writeU32(values.length);

        for (let i = 0; i < values.length; i++) {
            this.writeU256(values[i]);
        }
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

    public allocSafe(size: u32): void {
        if (this.currentOffset + size > this.buffer.byteLength) {
            this.resize(size);
        }
    }

    public writeABISelector(name: string, selector: Selector): void {
        this.writeStringWithLength(name);
        this.writeSelector(selector);
    }

    public writeAddressValueTupleMap(map: AddressMap<bigint>): void {
        if (map.size > 65535) throw new Error('Map size is too large');

        this.writeU16(map.size);

        const keys = Array.from(map.keys());
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = map.get(key);

            if (value === null || value === undefined) throw new Error('Value not found');

            this.writeAddress(key);
            this.writeU256(value);
        }
    }

    public writeLimitedAddressBytesMap(map: AddressMap<Uint8Array[]>): void {
        if (map.size > 8) throw new Error('Too many contract calls');

        this.writeU8(map.size);

        const keys: Address[] = Array.from(map.keys());
        for (let i: i32 = 0; i < keys.length; i++) {
            const address: Address = keys[i];
            const calls: Uint8Array[] | undefined = map.get(address);

            if (!calls) throw new Error('Calls not found');
            if (calls.length > 10) throw new Error('Too many calls.');

            this.writeAddress(address);
            this.writeU8(calls.length);

            for (let j: i32 = 0; j < calls.length; j++) {
                this.writeBytesWithLength(calls[j]);
            }
        }
    }

    public writeBytesWithLength(value: Uint8Array): void {
        this.writeU32(value.length);
        this.writeBytes(value);
    }

    public writeAddressArray(value: Address[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeAddress(value[i]);
        }
    }

    public writeU32Array(value: u32[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeU32(value[i]);
        }
    }

    public writeU256Array(value: bigint[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeU256(value[i]);
        }
    }

    public writeU128Array(value: bigint[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeU128(value[i]);
        }
    }

    public writeStringArray(value: string[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeStringWithLength(value[i]);
        }
    }

    public writeU16Array(value: u16[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeU16(value[i]);
        }
    }

    public writeU8Array(value: u8[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeU8(value[i]);
        }
    }

    public writeU64Array(value: bigint[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeU64(value[i]);
        }
    }

    public writeBytesArray(value: Uint8Array[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeBytesWithLength(value[i]);
        }
    }

    public writeSelectorArray(value: Selector[]): void {
        if (value.length > 65535) throw new Error('Array size is too large');

        this.writeU16(value.length);

        for (let i = 0; i < value.length; i++) {
            this.writeSelector(value[i]);
        }
    }

    private getChecksum(): u32 {
        let checksum: u32 = 0;
        for (let i = 0; i < this.buffer.byteLength; i++) {
            checksum += this.buffer.getUint8(i);
        }

        return checksum % 2 ** 32;
    }

    private writeMethodSelectorMap(value: Set<Selector>): void {
        this.writeU16(value.size);

        value.forEach((selector: Selector, _value: Selector, _set: Set<Selector>): void => {
            this.writeSelector(selector);
        });
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

        for (let i: i32 = 0; i < this.buffer.byteLength; i++) {
            buf[i] = this.buffer.getUint8(i);
        }

        this.buffer = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    }

    private getDefaultBuffer(length: number = 0): DataView {
        return new DataView(new ArrayBuffer(length));
    }
}
