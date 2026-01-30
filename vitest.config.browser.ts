import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
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
            '../build/opnet.js': resolve(__dirname, 'src/opnet.ts'),
            '../../build/opnet.js': resolve(__dirname, 'src/opnet.ts'),
        },
    },
    plugins: [
        nodePolyfills({
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
            exclude: ['crypto', 'fs', 'path', 'os', 'http', 'https', 'net', 'tls', 'dns', 'child_process', 'cluster', 'dgram', 'readline', 'repl', 'tty', 'worker_threads', 'perf_hooks', 'inspector', 'async_hooks', 'trace_events', 'v8', 'wasi', 'zlib', 'vm'],
        }),
    ],
    test: {
        globals: true,
        include: [
            // Browser-compatible existing tests (pure logic, no Node.js crypto)
            'test/address.test.ts',
            'test/addressmap.test.ts',
            'test/address-rotation.test.ts',
            'test/addressverificator-mldsa.test.ts',
            'test/binary-reader-writer.test.ts',
            'test/buffer-helper.test.ts',
            'test/derivePath.test.ts',
            'test/disposable.test.ts',
            'test/fastmap.test.ts',
            'test/fastmap-setall.test.ts',
            'test/messagesigner-mldsa.test.ts',
            'test/messagesigner-schnorr.test.ts',
            'test/network-awareness.test.ts',
            'test/oldfastmap.test.ts',
            'test/transaction-builders.test.ts',
            // Browser-adapted versions
            'test/browser/offline-transaction.test.ts',
            'test/browser/transaction-signing.test.ts',
            'test/browser/parallel-signing.test.ts',
        ],
        exclude: [
            // Original uses import { createHash } from 'crypto'
            'test/offline-transaction.test.ts',
        ],
        testTimeout: 30000,
        browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
        },
    },
});
