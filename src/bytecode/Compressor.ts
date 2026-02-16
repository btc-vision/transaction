import zlib, { type ZlibOptions } from 'zlib';

/** Compressor class for compressing and decompressing data. */
export class Compressor {
    private static readonly zlibOptions: ZlibOptions = {
        level: 9,
        maxOutputLength: 1024 * 1024 * 16, // 16mb, limit it to 16mb.
    };

    /**
     * Compresses the data using gzip.
     * @param {Uint8Array} data The data to compress.
     * @returns {Uint8Array} The compressed data.
     */
    public static compress(data: Uint8Array): Uint8Array {
        return new Uint8Array(zlib.gzipSync(data, Compressor.zlibOptions));
    }

    /**
     * Decompresses the data using gunzip.
     * @param {Uint8Array} data The data to decompress.
     * @returns {Uint8Array} The decompressed data.
     */
    public static decompress(data: Uint8Array): Uint8Array {
        return new Uint8Array(zlib.gunzipSync(data, Compressor.zlibOptions));
    }
}
