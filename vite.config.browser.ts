import { resolve } from 'path';
import { defineConfig, Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import dts from 'vite-plugin-dts';

// Strip unused bip39 wordlists (keep only English) - saves ~150KB
function stripBip39Wordlists(): Plugin {
    return {
        name: 'strip-bip39-wordlists',
        resolveId(source, importer) {
            // Match ./wordlists/*.json except english.json
            if (importer?.includes('bip39') &&
                source.includes('/wordlists/') &&
                !source.includes('english')) {
                return { id: 'empty-wordlist', external: false };
            }
            return null;
        },
        load(id) {
            if (id === 'empty-wordlist') {
                return 'export default []';
            }
            return null;
        },
    };
}

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
                    // BTC Vision packages - keep bitcoin separate as it's large and isolated
                    if (id.includes('@btc-vision/bitcoin') || id.includes('/bitcoin/build/') || id.includes('/bitcoin/browser/') || id.includes('/bitcoin/src/')) {
                        return 'btc-vision-bitcoin';
                    }
                    if (id.includes('node_modules')) {
                        // Noble crypto - isolated, no circular deps
                        if (id.includes('@noble/curves')) return 'noble-curves';
                        if (id.includes('@noble/hashes')) return 'noble-hashes';
                        // Everything else in vendors to avoid circular deps
                        return 'vendors';
                    }
                },
            },
        },
    },
    resolve: {
        alias: {
            crypto: resolve(__dirname, 'src/crypto/crypto-browser.js'),
            zlib: resolve(__dirname, 'src/shims/zlib-browser.js'),
            vm: resolve(__dirname, 'src/shims/vm-browser.js'),
            stream: 'stream-browserify',
            buffer: 'buffer',
            '@btc-vision/bitcoin/workers': resolve(__dirname, 'node_modules/@btc-vision/bitcoin/browser/workers/index.js'),
            '@btc-vision/bitcoin': resolve(__dirname, 'node_modules/@btc-vision/bitcoin/browser/index.js'),
            '@btc-vision/bip32': resolve(__dirname, 'node_modules/@btc-vision/bip32/src/cjs/index.cjs'),
        },
        mainFields: ['module', 'main'],
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        global: 'globalThis',
    },
    plugins: [
        stripBip39Wordlists(),
        nodePolyfills({
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
            // Exclude heavy polyfills we don't need (crypto, zlib, vm handled via aliases)
            exclude: ['crypto', 'fs', 'path', 'os', 'http', 'https', 'net', 'tls', 'dns', 'child_process', 'cluster', 'dgram', 'readline', 'repl', 'tty', 'worker_threads', 'perf_hooks', 'inspector', 'async_hooks', 'trace_events', 'v8', 'wasi', 'zlib', 'vm'],
        }),
        dts({
            tsconfigPath: resolve(__dirname, 'tsconfig.browser.json'),
            outDir: 'browser',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
            insertTypesEntry: true,
        }),
    ],
});
