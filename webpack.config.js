import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';

export default {
    mode: 'production',
    target: 'web',
    entry: {
        index: {
            import: './src/index.ts',
        },
    },
    watch: false,
    output: {
        filename: '[name].js',
        chunkFilename: 'chunks/[name].js',
        path: import.meta.dirname + '/browser',
        libraryTarget: 'module',
        chunkFormat: 'module',
        chunkLoading: 'import',
    },
    node: {
        __dirname: false,
    },
    experiments: {
        outputModule: true,
        asyncWebAssembly: false,
        syncWebAssembly: true,
    },
    resolve: {
        extensionAlias: {
            '.js': ['.js', '.ts'],
        },
        modules: ['.', 'node_modules'],
        extensions: ['.*', '.js', '.jsx', '.tsx', '.ts', '.wasm'],
        alias: {
            // Dedupe noble/curves to single version
            '@noble/curves': import.meta.dirname + '/node_modules/@noble/curves',
        },
        fallback: {
            buffer: import.meta.resolve('buffer/'),
            assert: import.meta.resolve('assert/'),
            crypto: import.meta.resolve('./src/crypto/crypto-browser.js'),
            http: import.meta.resolve('stream-http/'),
            https: import.meta.resolve('https-browserify/'),
            os: import.meta.resolve('os-browserify/browser/'),
            stream: import.meta.resolve('stream-browserify'),
            process: import.meta.resolve('process/browser'),
            zlib: import.meta.resolve('browserify-zlib'),
        },
    },
    cache: false,
    module: {
        rules: [
            {
                test: /\.(js|jsx|tsx|ts)$/,
                exclude: [/node_modules/, /test/, /__tests__/],
                resolve: {
                    fullySpecified: false,
                },
                use: [
                    {
                        loader: 'babel-loader',
                    },
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.webpack.json',
                        },
                    },
                ],
            },
        ],
    },
    optimization: {
        usedExports: true,
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false,
                        drop_debugger: true,
                        passes: 3,
                        pure_funcs: ['console.debug'],
                        dead_code: true,
                        unused: true,
                    },
                    mangle: {
                        safari10: true,
                    },
                    format: {
                        comments: false,
                    },
                },
                extractComments: false,
            }),
        ],
        concatenateModules: true,
        sideEffects: true,
        providedExports: true,
        innerGraph: true,
        splitChunks: {
            chunks: 'all',
            minSize: 1000,
            maxInitialRequests: Infinity,
            cacheGroups: {
                // Noble cryptographic libraries (curves + hashes)
                nobleCurves: {
                    test: /[\\/]node_modules[\\/]@noble[\\/]curves[\\/]/,
                    name: 'noble-curves',
                    priority: 50,
                    reuseExistingChunk: true,
                },
                nobleHashes: {
                    test: /[\\/]node_modules[\\/]@noble[\\/]hashes[\\/]/,
                    name: 'noble-hashes',
                    priority: 49,
                    reuseExistingChunk: true,
                },
                nobleSecp: {
                    test: /[\\/]node_modules[\\/]@noble[\\/]secp256k1[\\/]/,
                    name: 'noble-secp256k1',
                    priority: 48,
                    reuseExistingChunk: true,
                },
                // Separate @btc-vision packages
                btcBitcoin: {
                    test: /[\\/]node_modules[\\/]@btc-vision[\\/]bitcoin[\\/]/,
                    name: 'btc-vision-bitcoin',
                    priority: 45,
                    reuseExistingChunk: true,
                },
                btcBip32: {
                    test: /[\\/]node_modules[\\/]@btc-vision[\\/]bip32[\\/]/,
                    name: 'btc-vision-bip32',
                    priority: 44,
                    reuseExistingChunk: true,
                },
                btcPostQuantum: {
                    test: /[\\/]node_modules[\\/]@btc-vision[\\/]post-quantum[\\/]/,
                    name: 'btc-vision-post-quantum',
                    priority: 43,
                    reuseExistingChunk: true,
                },
                btcLogger: {
                    test: /[\\/]node_modules[\\/]@btc-vision[\\/]logger[\\/]/,
                    name: 'btc-vision-logger',
                    priority: 42,
                    reuseExistingChunk: true,
                },
                // Valibot validation library
                valibot: {
                    test: /[\\/]node_modules[\\/]valibot[\\/]/,
                    name: 'valibot',
                    priority: 40,
                    reuseExistingChunk: true,
                },
                // Pako compression
                pako: {
                    test: /[\\/]node_modules[\\/]pako[\\/]/,
                    name: 'pako',
                    priority: 39,
                    reuseExistingChunk: true,
                },
                // BIP39 mnemonic (wordlists are stripped via IgnorePlugin)
                bip39: {
                    test: /[\\/]node_modules[\\/]bip39[\\/]/,
                    name: 'bip39',
                    priority: 38,
                    reuseExistingChunk: true,
                },
                // Bitcoin utilities
                bitcoin: {
                    test: /[\\/]node_modules[\\/](bip174|bech32|ecpair|@bitcoinerlab)[\\/]/,
                    name: 'bitcoin-utils',
                    priority: 35,
                    reuseExistingChunk: true,
                },
                // Scure base encoding
                scure: {
                    test: /[\\/]node_modules[\\/]@scure[\\/]/,
                    name: 'scure-base',
                    priority: 34,
                    reuseExistingChunk: true,
                },
                // Buffer and stream polyfills
                polyfills: {
                    test: /[\\/]node_modules[\\/](buffer|stream-browserify|browserify-zlib|process|assert|os-browserify|https-browserify|stream-http)[\\/]/,
                    name: 'polyfills',
                    priority: 25,
                    reuseExistingChunk: true,
                },
                // Remaining vendor code
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    priority: 10,
                    reuseExistingChunk: true,
                },
            },
        },
    },
    plugins: [
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
            process: 'process/browser',
            stream: 'stream-browserify',
            zlib: 'browserify-zlib',
            bitcoin: '@btc-vision/bitcoin',
        }),
        // Strip unused bip39 wordlists (keep only English) - saves ~150KB
        new webpack.IgnorePlugin({
            resourceRegExp: /^\.\/wordlists\/(?!english)/,
            contextRegExp: /bip39/,
        }),
    ],
    // Externals config for dependent packages to avoid duplication
    // Other packages can set these externals and import chunks from @btc-vision/transaction
    externalsType: 'module',
};
