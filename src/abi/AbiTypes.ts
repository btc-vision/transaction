import type { Address } from '../keypair/Address.js';
import type { AddressMap } from '../deterministic/AddressMap.js';
import type { ExtendedAddressMap } from '../deterministic/ExtendedAddressMap.js';
import type { SchnorrSignature } from '../buffer/BinaryReader.js';
import { ABIDataTypes } from './ABIDataTypes.js';

/**
 * Recursive ABI type definition:
 * - Simple: ABIDataTypes enum value (e.g. ABIDataTypes.ADDRESS)
 * - Tuple: ordered array of AbiType (e.g. [ABIDataTypes.ADDRESS, ABIDataTypes.UINT8])
 * - Struct: named fields mapping to AbiType (e.g. { field1: ABIDataTypes.ADDRESS, field2: ABIDataTypes.UINT256 })
 * - Nested: any combination (e.g. [ABIDataTypes.ADDRESS, { inner: ABIDataTypes.UINT8 }])
 */
export type AbiType = ABIDataTypes | AbiType[] | { [field: string]: AbiType };

/**
 * Maps an AbiType to its corresponding TypeScript type at the type level.
 *
 * Usage with `as const`:
 * ```ts
 * const abi = { name: 'balance', type: ABIDataTypes.UINT256 } as const;
 * type Result = InferAbiType<typeof abi.type>; // bigint
 *
 * const structAbi = { name: 'status', type: { minted: ABIDataTypes.UINT256, active: ABIDataTypes.BOOL } } as const;
 * type StatusResult = InferAbiType<typeof structAbi.type>; // { minted: bigint; active: boolean }
 * ```
 */
export type InferAbiType<T extends AbiType> =
    // Small integers → number
    T extends
        | ABIDataTypes.UINT8
        | ABIDataTypes.UINT16
        | ABIDataTypes.UINT32
        | ABIDataTypes.INT8
        | ABIDataTypes.INT16
        | ABIDataTypes.INT32
        ? number
        : // Large integers → bigint
          T extends
                | ABIDataTypes.UINT64
                | ABIDataTypes.UINT128
                | ABIDataTypes.UINT256
                | ABIDataTypes.INT64
                | ABIDataTypes.INT128
            ? bigint
            : T extends ABIDataTypes.BOOL
              ? boolean
              : T extends ABIDataTypes.STRING
                ? string
                : T extends ABIDataTypes.ADDRESS | ABIDataTypes.EXTENDED_ADDRESS
                  ? Address
                  : T extends ABIDataTypes.BYTES | ABIDataTypes.BYTES4 | ABIDataTypes.BYTES32
                    ? Uint8Array
                    : T extends ABIDataTypes.SCHNORR_SIGNATURE
                      ? SchnorrSignature
                      : T extends ABIDataTypes.ADDRESS_UINT256_TUPLE
                        ? AddressMap<bigint>
                        : T extends ABIDataTypes.EXTENDED_ADDRESS_UINT256_TUPLE
                          ? ExtendedAddressMap<bigint>
                          : // Built-in array types
                            T extends
                                  | ABIDataTypes.ARRAY_OF_ADDRESSES
                                  | ABIDataTypes.ARRAY_OF_EXTENDED_ADDRESSES
                              ? Address[]
                              : T extends
                                      | ABIDataTypes.ARRAY_OF_UINT256
                                      | ABIDataTypes.ARRAY_OF_UINT128
                                      | ABIDataTypes.ARRAY_OF_UINT64
                                  ? bigint[]
                                  : T extends
                                          | ABIDataTypes.ARRAY_OF_UINT32
                                          | ABIDataTypes.ARRAY_OF_UINT16
                                          | ABIDataTypes.ARRAY_OF_UINT8
                                      ? number[]
                                      : T extends ABIDataTypes.ARRAY_OF_STRING
                                        ? string[]
                                        : T extends
                                                | ABIDataTypes.ARRAY_OF_BYTES
                                                | ABIDataTypes.ARRAY_OF_BUFFERS
                                            ? Uint8Array[]
                                            : // Struct: single object with mapped fields (no array wrapper)
                                              T extends Record<string, AbiType>
                                              ? {
                                                    [K in keyof T]: T[K] extends AbiType
                                                        ? InferAbiType<T[K]>
                                                        : never;
                                                }
                                              : // Single-element tuple: unwrap to typed array
                                                T extends readonly [infer Single extends AbiType]
                                                ? InferAbiType<Single>[]
                                                : // Multi-element tuple: array of mapped tuples
                                                  T extends readonly [
                                                        AbiType,
                                                        AbiType,
                                                        ...AbiType[],
                                                    ]
                                                    ? {
                                                          [K in keyof T]: T[K] extends AbiType
                                                              ? InferAbiType<T[K]>
                                                              : T[K];
                                                      }[]
                                                    : // Generic array fallback
                                                      T extends readonly AbiType[]
                                                      ? unknown[]
                                                      : never;

/**
 * Canonical string → ABIDataTypes mapping.
 * Only includes canonical ABI-style names (not AssemblyScript aliases).
 */
export const StrToAbiType: { [key: string]: ABIDataTypes } = {
    address: ABIDataTypes.ADDRESS,
    extendedAddress: ABIDataTypes.EXTENDED_ADDRESS,
    bool: ABIDataTypes.BOOL,
    bytes: ABIDataTypes.BYTES,
    uint256: ABIDataTypes.UINT256,
    uint128: ABIDataTypes.UINT128,
    uint64: ABIDataTypes.UINT64,
    uint32: ABIDataTypes.UINT32,
    uint16: ABIDataTypes.UINT16,
    uint8: ABIDataTypes.UINT8,
    int128: ABIDataTypes.INT128,
    int64: ABIDataTypes.INT64,
    int32: ABIDataTypes.INT32,
    int16: ABIDataTypes.INT16,
    int8: ABIDataTypes.INT8,
    string: ABIDataTypes.STRING,
    bytes4: ABIDataTypes.BYTES4,
    bytes32: ABIDataTypes.BYTES32,
    schnorrSignature: ABIDataTypes.SCHNORR_SIGNATURE,
    'tuple(address,uint256)[]': ABIDataTypes.ADDRESS_UINT256_TUPLE,
    'tuple(extendedAddress,uint256)[]': ABIDataTypes.EXTENDED_ADDRESS_UINT256_TUPLE,
    'address[]': ABIDataTypes.ARRAY_OF_ADDRESSES,
    'extendedAddress[]': ABIDataTypes.ARRAY_OF_EXTENDED_ADDRESSES,
    'uint256[]': ABIDataTypes.ARRAY_OF_UINT256,
    'uint128[]': ABIDataTypes.ARRAY_OF_UINT128,
    'uint64[]': ABIDataTypes.ARRAY_OF_UINT64,
    'uint32[]': ABIDataTypes.ARRAY_OF_UINT32,
    'uint16[]': ABIDataTypes.ARRAY_OF_UINT16,
    'uint8[]': ABIDataTypes.ARRAY_OF_UINT8,
    'bytes[]': ABIDataTypes.ARRAY_OF_BYTES,
    'buffer[]': ABIDataTypes.ARRAY_OF_BUFFERS,
    'string[]': ABIDataTypes.ARRAY_OF_STRING,
    boolean: ABIDataTypes.BOOL,
};

/**
 * Canonical reverse mapping: ABIDataTypes → canonical string.
 */
export const AbiTypeToStr: { [key in ABIDataTypes]: string } = {
    [ABIDataTypes.ADDRESS]: 'address',
    [ABIDataTypes.EXTENDED_ADDRESS]: 'extendedAddress',
    [ABIDataTypes.BOOL]: 'bool',
    [ABIDataTypes.BYTES]: 'bytes',
    [ABIDataTypes.BYTES32]: 'bytes32',
    [ABIDataTypes.BYTES4]: 'bytes4',
    [ABIDataTypes.UINT256]: 'uint256',
    [ABIDataTypes.UINT128]: 'uint128',
    [ABIDataTypes.UINT64]: 'uint64',
    [ABIDataTypes.UINT32]: 'uint32',
    [ABIDataTypes.UINT16]: 'uint16',
    [ABIDataTypes.UINT8]: 'uint8',
    [ABIDataTypes.INT128]: 'int128',
    [ABIDataTypes.INT64]: 'int64',
    [ABIDataTypes.INT32]: 'int32',
    [ABIDataTypes.INT16]: 'int16',
    [ABIDataTypes.INT8]: 'int8',
    [ABIDataTypes.STRING]: 'string',
    [ABIDataTypes.ADDRESS_UINT256_TUPLE]: 'tuple(address,uint256)[]',
    [ABIDataTypes.EXTENDED_ADDRESS_UINT256_TUPLE]: 'tuple(extendedAddress,uint256)[]',
    [ABIDataTypes.SCHNORR_SIGNATURE]: 'schnorrSignature',
    [ABIDataTypes.ARRAY_OF_ADDRESSES]: 'address[]',
    [ABIDataTypes.ARRAY_OF_EXTENDED_ADDRESSES]: 'extendedAddress[]',
    [ABIDataTypes.ARRAY_OF_UINT256]: 'uint256[]',
    [ABIDataTypes.ARRAY_OF_UINT128]: 'uint128[]',
    [ABIDataTypes.ARRAY_OF_UINT64]: 'uint64[]',
    [ABIDataTypes.ARRAY_OF_UINT32]: 'uint32[]',
    [ABIDataTypes.ARRAY_OF_UINT16]: 'uint16[]',
    [ABIDataTypes.ARRAY_OF_UINT8]: 'uint8[]',
    [ABIDataTypes.ARRAY_OF_BYTES]: 'bytes[]',
    [ABIDataTypes.ARRAY_OF_STRING]: 'string[]',
    [ABIDataTypes.ARRAY_OF_BUFFERS]: 'buffer[]',
};
