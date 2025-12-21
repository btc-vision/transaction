import { resolve } from 'path';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        outDir: 'browser',
        emptyOutDir: true,
        target: 'esnext',
        minify: 'esbuild',
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            formats: ['es'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            output: {
                chunkFileNames: '[name].js',
                manualChunks: (id) => {
                    // BTC Vision packages (check before node_modules since aliases resolve differently)
                    if (id.includes('@btc-vision/bitcoin') || id.includes('/bitcoin/build/') || id.includes('/bitcoin/src/')) {
                        return 'btc-vision-bitcoin';
                    }
                    if (id.includes('@btc-vision/bip32') || id.includes('/bip32/src/')) {
                        return 'btc-vision-bip32';
                    }
                    if (id.includes('node_modules')) {
                        // Noble crypto
                        if (id.includes('@noble/curves')) return 'noble-curves';
                        if (id.includes('@noble/hashes')) return 'noble-hashes';
                        // BTC Vision packages
                        if (id.includes('@btc-vision/post-quantum')) return 'btc-vision-post-quantum';
                        if (id.includes('@btc-vision/logger')) return 'btc-vision-logger';
                        // Bitcoin utilities
                        if (id.includes('bip39')) return 'bip39';
                        if (id.includes('ecpair') || id.includes('@bitcoinerlab/secp256k1') ||
                            id.includes('bech32') || id.includes('bip174') || id.includes('bs58') ||
                            id.includes('typeforce') || id.includes('varuint')) {
                            return 'bitcoin-utils';
                        }
                        // Validation
                        if (id.includes('valibot')) return 'valibot';
                        // Scure
                        if (id.includes('@scure/')) return 'scure-base';
                        // Polyfills
                        if (id.includes('buffer/') || id.includes('process/') || id.includes('stream-browserify') ||
                            id.includes('readable-stream') || id.includes('safe-buffer') || id.includes('events/') ||
                            id.includes('util/') || id.includes('inherits') || id.includes('ieee754') ||
                            id.includes('base64-js') || id.includes('string_decoder')) {
                            return 'polyfills';
                        }
                        // Other vendors
                        return 'vendors';
                    }
                },
            },
        },
    },
    resolve: {
        alias: {
            crypto: resolve(__dirname, 'src/crypto/crypto-browser.js'),
            stream: 'stream-browserify',
            buffer: 'buffer',
            // Use source versions for proper tree-shaking (not browser bundles)
            '@btc-vision/bitcoin': resolve(__dirname, 'node_modules/@btc-vision/bitcoin/build/index.js'),
            '@btc-vision/bip32': resolve(__dirname, 'node_modules/@btc-vision/bip32/src/cjs/index.cjs'),
        },
        mainFields: ['module', 'main'],
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        global: 'globalThis',
    },
    plugins: [
        nodePolyfills({
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
            // Exclude heavy polyfills we don't need
            exclude: ['fs', 'path', 'os', 'http', 'https', 'zlib', 'net', 'tls', 'dns', 'child_process', 'cluster', 'dgram', 'readline', 'repl', 'tty', 'vm', 'worker_threads', 'perf_hooks', 'inspector', 'async_hooks', 'trace_events', 'v8', 'wasi'],
        }),
        dts({
            outDir: 'browser',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
            insertTypesEntry: true,
        }),
    ],
});
