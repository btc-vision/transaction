import pako from 'pako';

export function gzipSync(data, options = {}) {
    return Buffer.from(pako.gzip(data, { level: options.level || 6 }));
}

export function gunzipSync(data) {
    return Buffer.from(pako.ungzip(data));
}

export function deflateSync(data, options = {}) {
    return Buffer.from(pako.deflate(data, { level: options.level || 6 }));
}

export function inflateSync(data) {
    return Buffer.from(pako.inflate(data));
}

export default {
    gzipSync,
    gunzipSync,
    deflateSync,
    inflateSync,
};
