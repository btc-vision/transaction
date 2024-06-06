import zlib, { ZlibOptions } from 'zlib';

/** Compressor class for compressing and decompressing data. */
export class Compressor {
    private static readonly zlibOptions: ZlibOptions = {
        level: zlib.constants.Z_MAX_LEVEL,
        maxOutputLength: 1024 * 1024 * 16, // 16mb, limit it to 16mb.
    };

    /**
     * Compresses the data using gzip.
     * @param {Uint8Array | Buffer} data The data to compress.
     * @returns {Buffer} The compressed data.
     */
    public static compress(data: Uint8Array | Buffer): Buffer {
        return zlib.gzipSync(data, Compressor.zlibOptions);
    }

    /**
     * Decompresses the data using gunzip.
     * @param {Uint8Array | Buffer} data The data to decompress.
     * @returns {Buffer} The decompressed data.
     */
    public static decompress(data: Uint8Array | Buffer): Buffer {
        return zlib.gunzipSync(data, Compressor.zlibOptions);
    }
}
