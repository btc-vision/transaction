import { ABIDataTypes } from './ABIDataTypes.js';
import type { AbiType } from './AbiTypes.js';
import { AbiTypeToStr } from './AbiTypes.js';

/**
 * Type guard: returns true if the ABI type is a tuple (ordered array of types).
 */
export function isAbiTuple(type: AbiType): type is AbiType[] {
    return Array.isArray(type);
}

/**
 * Type guard: returns true if the ABI type is a struct (named fields).
 */
export function isAbiStruct(type: AbiType): type is { [field: string]: AbiType } {
    return typeof type === 'object' && type !== null && !Array.isArray(type);
}

/**
 * Type guard: returns true if the ABI type is a simple ABIDataTypes enum value.
 */
export function isSimpleAbiType(type: AbiType): type is ABIDataTypes {
    return typeof type === 'string';
}

/**
 * Converts a structured AbiType into a canonical selector string.
 * - Simple: ABIDataTypes.ADDRESS → "address"
 * - Struct: { a: ADDRESS, b: UINT256 } → "tuple(address,uint256)" (inline, no [])
 * - Single-element tuple: [UINT256] → "uint256[]"
 * - Multi-element tuple: [ADDRESS, UINT256] → "tuple(address,uint256)[]"
 */
export function abiTypeToSelectorString(type: AbiType): string {
    if (isSimpleAbiType(type)) {
        const str = AbiTypeToStr[type];
        if (!str) {
            throw new Error(`Unknown ABI type: ${type}`);
        }
        return str;
    }

    // Struct: inline tuple (no [] suffix)
    if (isAbiStruct(type)) {
        const inner = Object.values(type)
            .map((t) => abiTypeToSelectorString(t))
            .join(',');
        return `tuple(${inner})`;
    }

    // Single-element tuple: unwrap to "type[]"
    const firstType = type[0];
    if (type.length === 1 && firstType !== undefined) {
        return `${abiTypeToSelectorString(firstType)}[]`;
    }

    // Multi-element tuple: "tuple(types...)[]"
    const inner = type.map((t) => abiTypeToSelectorString(t)).join(',');
    return `tuple(${inner})[]`;
}
