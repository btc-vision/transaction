import shajs from 'sha.js';

import { BinaryReader } from '../buffer/BinaryReader.js';
import { BufferHelper } from '../utils/BufferHelper.js';

export enum ABIDataTypes {
    UINT8 = 'UINT8',
    UINT16 = 'UINT16',
    UINT32 = 'UINT32',
    UINT64 = 'UINT64',
    UINT128 = 'UINT128',
    UINT256 = 'UINT256',
    INT128 = 'INT128',
    BOOL = 'BOOL',
    ADDRESS = 'ADDRESS',
    STRING = 'STRING',
    BYTES4 = 'BYTES4',
    BYTES32 = 'BYTES32',
    BYTES = 'BYTES',
    ADDRESS_UINT256_TUPLE = 'ADDRESS_UINT256_TUPLE',
    ARRAY_OF_ADDRESSES = 'ARRAY_OF_ADDRESSES',
    ARRAY_OF_UINT256 = 'ARRAY_OF_UINT256',
    ARRAY_OF_UINT128 = 'ARRAY_OF_UINT128',
    ARRAY_OF_UINT64 = 'ARRAY_OF_UINT64',
    ARRAY_OF_UINT32 = 'ARRAY_OF_UINT32',
    ARRAY_OF_UINT16 = 'ARRAY_OF_UINT16',
    ARRAY_OF_UINT8 = 'ARRAY_OF_UINT8',
    ARRAY_OF_STRING = 'ARRAY_OF_STRING',
    ARRAY_OF_BYTES = 'ARRAY_OF_BYTES',
    ARRAY_OF_BUFFERS = 'ARRAY_OF_BUFFERS',
}

export class ABICoder {
    public decodeData(data: Uint8Array, types: ABIDataTypes[]): unknown[] {
        const byteReader = new BinaryReader(data);
        const result: unknown[] = [];

        for (let i = 0; i < types.length; i++) {
            const type = types[i];
            switch (type) {
                case ABIDataTypes.UINT8:
                    result.push(byteReader.readU8());
                    break;
                case ABIDataTypes.UINT16:
                    result.push(byteReader.readU16());
                    break;
                case ABIDataTypes.UINT32:
                    result.push(byteReader.readU32());
                    break;
                case ABIDataTypes.BYTES4:
                    result.push(byteReader.readBytes(4));
                    break;
                case ABIDataTypes.BYTES32:
                    result.push(byteReader.readBytes(32));
                    break;
                case ABIDataTypes.BOOL:
                    result.push(byteReader.readBoolean());
                    break;
                case ABIDataTypes.ADDRESS:
                    result.push(byteReader.readAddress());
                    break;
                case ABIDataTypes.STRING:
                    result.push(byteReader.readStringWithLength());
                    break;
                case ABIDataTypes.UINT128:
                    result.push(byteReader.readU128());
                    break;
                case ABIDataTypes.UINT256:
                    result.push(byteReader.readU256());
                    break;
                case ABIDataTypes.INT128:
                    result.push(byteReader.readI128());
                    break;
                case ABIDataTypes.ADDRESS_UINT256_TUPLE:
                    result.push(byteReader.readAddressValueTuple());
                    break;
                case ABIDataTypes.BYTES:
                    result.push(byteReader.readBytesWithLength());
                    break;
                case ABIDataTypes.UINT64:
                    result.push(byteReader.readU64());
                    break;
                case ABIDataTypes.ARRAY_OF_ADDRESSES:
                    result.push(byteReader.readAddressArray());
                    break;
                case ABIDataTypes.ARRAY_OF_UINT256:
                    result.push(byteReader.readU256Array());
                    break;
                case ABIDataTypes.ARRAY_OF_UINT128:
                    result.push(byteReader.readU128Array());
                    break;
                case ABIDataTypes.ARRAY_OF_UINT64:
                    result.push(byteReader.readU64Array());
                    break;
                case ABIDataTypes.ARRAY_OF_UINT32:
                    result.push(byteReader.readU32Array());
                    break;
                case ABIDataTypes.ARRAY_OF_UINT16:
                    result.push(byteReader.readU16Array());
                    break;
                case ABIDataTypes.ARRAY_OF_UINT8:
                    result.push(byteReader.readU8Array());
                    break;
                case ABIDataTypes.ARRAY_OF_STRING:
                    result.push(byteReader.readStringArray());
                    break;
                case ABIDataTypes.ARRAY_OF_BYTES:
                    result.push(byteReader.readBytesArray());
                    break;
                case ABIDataTypes.ARRAY_OF_BUFFERS:
                    result.push(byteReader.readArrayOfBuffer());
                    break;
            }
        }

        return result;
    }

    public encodeSelector(selectorIdentifier: string): string {
        // first 4 bytes of sha256 hash of the function signature
        const hash = this.sha256(selectorIdentifier);
        const selector = hash.subarray(0, 4); // 4 bytes

        return selector.toString('hex');
    }

    public numericSelectorToHex(selector: number): string {
        return selector.toString(16);
    }

    private bigIntToUint8Array(bigIntValue: bigint, length: number): Uint8Array {
        const byteArray = new Uint8Array(length);
        const buf = BufferHelper.valueToUint8Array(bigIntValue);

        for (let i = 0; i < length; i++) {
            byteArray[i] = buf[i] || 0;
        }

        return byteArray;
    }

    private sha256(buffer: Buffer | string | Uint8Array): Buffer {
        return new shajs.sha256().update(buffer).digest();
    }
}
