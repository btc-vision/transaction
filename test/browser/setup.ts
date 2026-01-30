import { sha256 } from '@noble/hashes/sha2.js';

export function randomBytes(size: number): Uint8Array {
    const buf = new Uint8Array(size);
    globalThis.crypto.getRandomValues(buf);
    return buf;
}

export function doubleSha256(data: Uint8Array): Uint8Array {
    return sha256(sha256(data));
}
