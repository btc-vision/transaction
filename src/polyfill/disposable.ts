/**
 * Polyfill for Symbol.dispose and Symbol.asyncDispose.
 *
 * ES2024 Explicit Resource Management defines these well-known symbols,
 * but Safari and Android WebView do not yet support them. This polyfill
 * creates globally-shared symbols via Symbol.for() so that classes can
 * implement [Symbol.dispose]() and [Symbol.asyncDispose]() today.
 *
 * When native support lands, the guards prevent the polyfill from running
 * and the native symbols are used transparently.
 *
 * NOTE: This file must be imported before any module that references
 * Symbol.dispose or Symbol.asyncDispose at the module-evaluation scope.
 */

interface PolyfillableSymbolConstructor {
    dispose?: symbol;
    asyncDispose?: symbol;
}

const S = Symbol as unknown as PolyfillableSymbolConstructor;

if (typeof S.dispose !== 'symbol') {
    S.dispose = Symbol.for('Symbol.dispose');
}

if (typeof S.asyncDispose !== 'symbol') {
    S.asyncDispose = Symbol.for('Symbol.asyncDispose');
}
