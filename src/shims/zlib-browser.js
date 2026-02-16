import pako from 'pako';

export function gzipSync(data, options = {}) {
    return new Uint8Array(pako.gzip(data, { level: options.level || 6 }));
}

export function gunzipSync(data) {
    return new Uint8Array(pako.ungzip(data));
}

export function deflateSync(data, options = {}) {
    return new Uint8Array(pako.deflate(data, { level: options.level || 6 }));
}

export function inflateSync(data) {
    return new Uint8Array(pako.inflate(data));
}

export default {
    gzipSync,
    gunzipSync,
    deflateSync,
    inflateSync,
};
