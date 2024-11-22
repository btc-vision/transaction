import { ADDRESS_BYTE_LENGTH, BufferLike, i32, Selector, u16, u32, u8 } from '../utils/types.js';
import { Address } from '../keypair/Address.js';
import { AddressMap } from '../deterministic/AddressMap.js';

export class BinaryReader {
    private buffer: DataView;

    private currentOffset: i32 = 0;

    constructor(bytes: BufferLike) {
        this.buffer = new DataView(bytes.buffer);
    }

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
        this.buffer = new DataView(bytes.buffer);

        this.currentOffset = 0;
    }

    public readAddressArray(): Address[] {
        const length = this.readU16();
        const result: Address[] = new Array<Address>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readAddress();
        }

        return result;
    }

    public readU256Array(): bigint[] {
        const length = this.readU16();
        const result: bigint[] = new Array<bigint>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readU256();
        }

        return result;
    }

    public readU64Array(): bigint[] {
        const length = this.readU16();
        const result: bigint[] = new Array<bigint>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readU64();
        }

        return result;
    }

    public readU32Array(): u32[] {
        const length = this.readU16();
        const result: u32[] = new Array<u32>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readU32();
        }

        return result;
    }

    public readU16Array(): u16[] {
        const length = this.readU16();
        const result: u16[] = new Array<u16>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readU16();
        }

        return result;
    }

    public readU8Array(): u8[] {
        const length = this.readU16();
        const result: u8[] = new Array<u8>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readU8();
        }

        return result;
    }

    public readStringArray(): string[] {
        const length = this.readU16();
        const result: string[] = new Array<string>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readStringWithLength();
        }

        return result;
    }

    public readBytesArray(): Uint8Array[] {
        const length = this.readU16();
        const result: Uint8Array[] = new Array<Uint8Array>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readBytesWithLength();
        }

        return result;
    }

    public readBytesWithLength(maxLength: number = 0): Uint8Array {
        const length = this.readU32();

        if (maxLength > 0 && length > maxLength) {
            throw new Error('Data length exceeds maximum length.');
        }

        return this.readBytes(length);
    }

    public readTuple(): bigint[] {
        const length = this.readU32();
        const result: bigint[] = new Array<bigint>(length);

        for (let i = 0; i < length; i++) {
            result[i] = this.readU256();
        }

        return result;
    }

    public readU8(): u8 {
        this.verifyEnd(this.currentOffset + 1);

        return this.buffer.getUint8(this.currentOffset++);
    }

    public readU16(): u16 {
        this.verifyEnd(this.currentOffset + 2);

        const value = this.buffer.getUint16(this.currentOffset, true);
        this.currentOffset += 2;

        return value;
    }

    public readU32(le: boolean = true): u32 {
        this.verifyEnd(this.currentOffset + 4);

        const value = this.buffer.getUint32(this.currentOffset, le);
        this.currentOffset += 4;

        return value;
    }

    public readU64(): bigint {
        this.verifyEnd(this.currentOffset + 8);

        const value: bigint = this.buffer.getBigUint64(this.currentOffset, true);
        this.currentOffset += 8;

        return value;
    }

    public readAddressValueTuple(): AddressMap<bigint> {
        const length = this.readU16();
        const result = new AddressMap<bigint>();

        for (let i = 0; i < length; i++) {
            const address = this.readAddress();
            const value = this.readU256();

            if (result.has(address)) throw new Error('Duplicate address found in map');

            result.set(address, value);
        }

        return result;
    }

    public readU128(): bigint {
        const next16Bytes = this.readBytes(16);

        return BigInt(
            '0x' + next16Bytes.reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), ''),
        );
    }

    public readU256(): bigint {
        const next32Bytes = this.readBytes(32);

        return BigInt(
            '0x' + next32Bytes.reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), ''),
        );
    }

    public readBytes(length: u32, zeroStop: boolean = false): Uint8Array {
        let bytes: Uint8Array = new Uint8Array(length);
        for (let i: u32 = 0; i < length; i++) {
            const byte: u8 = this.readU8();
            if (zeroStop && byte === 0) {
                bytes = bytes.slice(0, i);
                break;
            }

            bytes[i] = byte;
        }

        return bytes;
    }

    public readString(length: u16): string {
        const textDecoder = new TextDecoder();
        const bytes = this.readBytes(length, true);

        return textDecoder.decode(bytes);
    }

    public readSelector(): Selector {
        return this.readU32(false);
    }

    public readStringWithLength(): string {
        const length = this.readU16();

        return this.readString(length);
    }

    public readBoolean(): boolean {
        return this.readU8() !== 0;
    }

    public readAddress(): Address {
        const bytes: u8[] = new Array<u8>(ADDRESS_BYTE_LENGTH);
        for (let i: u32 = 0; i < ADDRESS_BYTE_LENGTH; i++) {
            bytes[i] = this.readU8();
        }

        return new Address(bytes);
    }

    public getOffset(): u16 {
        return this.currentOffset;
    }

    public setOffset(offset: u16): void {
        this.currentOffset = offset;
    }

    public verifyEnd(size: i32): void {
        if (this.currentOffset > this.buffer.byteLength) {
            throw new Error(`Expected to read ${size} bytes but read ${this.currentOffset} bytes`);
        }
    }
}
