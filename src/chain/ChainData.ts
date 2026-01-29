import { Network, networks } from '@btc-vision/bitcoin';

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (a.constructor !== b.constructor) return false;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = a.length; i-- !== 0; ) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        if (a instanceof Map && b instanceof Map) {
            if (a.size !== b.size) return false;
            for (const [key] of a) {
                if (!b.has(key)) return false;
            }
            for (const [key, val] of a) {
                if (!deepEqual(val, b.get(key))) return false;
            }
            return true;
        }

        if (a instanceof Set && b instanceof Set) {
            if (a.size !== b.size) return false;
            for (const val of a) {
                if (!b.has(val)) return false;
            }
            return true;
        }

        if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
            const viewA = a as Uint8Array;
            const viewB = b as Uint8Array;
            if (viewA.length !== viewB.length) return false;
            for (let i = viewA.length; i-- !== 0; ) {
                if (viewA[i] !== viewB[i]) return false;
            }
            return true;
        }

        if (a instanceof RegExp && b instanceof RegExp) {
            return a.source === b.source && a.flags === b.flags;
        }

        if (a.valueOf !== Object.prototype.valueOf) {
            return a.valueOf() === b.valueOf();
        }

        if (a.toString !== Object.prototype.toString) {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            return a.toString() === b.toString();
        }

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (let i = keysA.length; i-- !== 0; ) {
            if (!Object.prototype.hasOwnProperty.call(b, keysA[i])) return false;
        }

        for (let i = keysA.length; i-- !== 0; ) {
            const key = keysA[i];
            if (
                !deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
            ) {
                return false;
            }
        }

        return true;
    }

    return a !== a && b !== b;
}

export function getChainIdHex(network: Network): string {
    if (deepEqual(network, networks.bitcoin)) {
        return '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
    }

    if (deepEqual(network, networks.testnet)) {
        return '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943';
    }

    if (deepEqual(network, networks.regtest)) {
        return '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206';
    }

    throw new Error('Unsupported network for chain ID retrieval');
}

export function getChainId(network: Network): Uint8Array {
    return Uint8Array.from(Buffer.from(getChainIdHex(network), 'hex'));
}

export const BITCOIN_PROTOCOL_ID = Uint8Array.from(
    Buffer.from(
        'e784995a412d773988c4b8e333d7b39dfb3cabf118d0d645411a916ca2407939', // sha256("OP_NET")
        'hex',
    ),
);
