import shajs from 'sha.js';

import { BinaryReader } from '../buffer/BinaryReader.js';
import { ABIDataTypes } from './ABIDataTypes.js';
import type { AbiType } from './AbiTypes.js';
import { isAbiStruct, isAbiTuple } from './TupleUtils.js';

export class ABICoder {
    public decodeData(data: Uint8Array, types: AbiType[]): unknown[] {
        const byteReader = new BinaryReader(data);
        const result: unknown[] = [];

        for (const type of types) {
            result.push(this.decodeSingleValue(byteReader, type));
        }

        return result;
    }

    public encodeSelector(selectorIdentifier: string): string {
        // first 4 bytes of sha256 hash of the function signature
        const hash = this.sha256(selectorIdentifier);
        const selector = hash.subarray(0, 4); // 4 bytes

        return Array.from(selector, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    public numericSelectorToHex(selector: number): string {
        return selector.toString(16);
    }

    /**
     * Decodes a single value from the reader based on the ABI type.
     * Supports ABIDataTypes enum values, tuple arrays, and struct objects.
     */
    public decodeSingleValue(reader: BinaryReader, type: AbiType): unknown {
        if (isAbiTuple(type)) {
            // Single-element tuple: unwrap to flat array
            const firstType = type[0];
            if (type.length === 1 && firstType !== undefined) {
                return this.decodeArray(reader, firstType);
            }

            return this.decodeTuple(reader, type);
        }

        if (isAbiStruct(type)) {
            return this.decodeStruct(reader, type);
        }

        switch (type) {
            case ABIDataTypes.UINT8:
                return reader.readU8();
            case ABIDataTypes.UINT16:
                return reader.readU16();
            case ABIDataTypes.UINT32:
                return reader.readU32();
            case ABIDataTypes.BYTES4:
                return reader.readBytes(4);
            case ABIDataTypes.BYTES32:
                return reader.readBytes(32);
            case ABIDataTypes.BOOL:
                return reader.readBoolean();
            case ABIDataTypes.ADDRESS:
                return reader.readAddress();
            case ABIDataTypes.STRING:
                return reader.readStringWithLength();
            case ABIDataTypes.UINT128:
                return reader.readU128();
            case ABIDataTypes.UINT256:
                return reader.readU256();
            case ABIDataTypes.INT8:
                return reader.readI8();
            case ABIDataTypes.INT16:
                return reader.readI16();
            case ABIDataTypes.INT32:
                return reader.readI32();
            case ABIDataTypes.INT64:
                return reader.readI64();
            case ABIDataTypes.INT128:
                return reader.readI128();
            case ABIDataTypes.EXTENDED_ADDRESS:
                return reader.readExtendedAddress();
            case ABIDataTypes.ADDRESS_UINT256_TUPLE:
                return reader.readAddressValueTuple();
            case ABIDataTypes.EXTENDED_ADDRESS_UINT256_TUPLE:
                return reader.readExtendedAddressMapU256();
            case ABIDataTypes.SCHNORR_SIGNATURE:
                return reader.readSchnorrSignature();
            case ABIDataTypes.BYTES:
                return reader.readBytesWithLength();
            case ABIDataTypes.UINT64:
                return reader.readU64();
            case ABIDataTypes.ARRAY_OF_ADDRESSES:
                return reader.readAddressArray();
            case ABIDataTypes.ARRAY_OF_EXTENDED_ADDRESSES:
                return reader.readExtendedAddressArray();
            case ABIDataTypes.ARRAY_OF_UINT256:
                return reader.readU256Array();
            case ABIDataTypes.ARRAY_OF_UINT128:
                return reader.readU128Array();
            case ABIDataTypes.ARRAY_OF_UINT64:
                return reader.readU64Array();
            case ABIDataTypes.ARRAY_OF_UINT32:
                return reader.readU32Array();
            case ABIDataTypes.ARRAY_OF_UINT16:
                return reader.readU16Array();
            case ABIDataTypes.ARRAY_OF_UINT8:
                return reader.readU8Array();
            case ABIDataTypes.ARRAY_OF_STRING:
                return reader.readStringArray();
            case ABIDataTypes.ARRAY_OF_BYTES:
                return reader.readBytesArray();
            case ABIDataTypes.ARRAY_OF_BUFFERS:
                return reader.readArrayOfBuffer();
            default:
                throw new Error(`Unsupported ABI type: ${type}`);
        }
    }

    /** Decodes a single-element tuple as a flat typed array (u16 count + values). */
    private decodeArray(reader: BinaryReader, elementType: AbiType): unknown[] {
        const count = reader.readU16();
        const result: unknown[] = [];

        for (let i = 0; i < count; i++) {
            result.push(this.decodeSingleValue(reader, elementType));
        }

        return result;
    }

    /** Decodes a multi-element tuple as array of tuple entries (u16 count + entries). */
    private decodeTuple(reader: BinaryReader, types: AbiType[]): unknown[][] {
        const count = reader.readU16();
        const result: unknown[][] = [];

        for (let i = 0; i < count; i++) {
            const entry: unknown[] = [];
            for (const fieldType of types) {
                entry.push(this.decodeSingleValue(reader, fieldType));
            }

            result.push(entry);
        }

        return result;
    }

    /** Decodes a struct as a single object with named fields (inline, no count prefix). */
    private decodeStruct(
        reader: BinaryReader,
        struct: { [field: string]: AbiType },
    ): Record<string, unknown> {
        const entry: Record<string, unknown> = {};

        for (const [name, fieldType] of Object.entries(struct)) {
            entry[name] = this.decodeSingleValue(reader, fieldType);
        }

        return entry;
    }

    private sha256(buffer: Uint8Array | string): Uint8Array {
        return new Uint8Array(new shajs.sha256().update(buffer).digest());
    }
}
