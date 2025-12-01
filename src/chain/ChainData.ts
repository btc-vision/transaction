import { Network, networks } from '@btc-vision/bitcoin';

function objectEqual<T>(obj1: T, obj2: T): boolean {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

export function getChainIdHex(network: Network): string {
    if (objectEqual(network, networks.bitcoin)) {
        return '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
    }

    if (objectEqual(network, networks.testnet)) {
        return '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943';
    }

    if (objectEqual(network, networks.regtest)) {
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
