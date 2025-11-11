import { describe, it, expect } from 'vitest';
import { Mnemonic, MLDSASecurityLevel } from '../build/opnet.js';
import { networks } from '@btc-vision/bitcoin';

describe('Wallet.derivePath', () => {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    describe('Basic derivation', () => {
        it('should derive child wallet with unique addresses', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);
            const child = wallet.derivePath('m/0');

            // Addresses should be different
            expect(child.p2tr).not.toBe(wallet.p2tr);
            expect(child.p2wpkh).not.toBe(wallet.p2wpkh);

            // Private keys should be different
            expect(child.toPrivateKeyHex()).not.toBe(wallet.toPrivateKeyHex());
            expect(child.quantumPrivateKeyHex).not.toBe(wallet.quantumPrivateKeyHex);
        });

        it('should derive wallet with correct address prefixes', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);
            const child = wallet.derivePath('m/0');

            expect(child.p2tr).toMatch(/^bc1p/);
            expect(child.p2wpkh).toMatch(/^bc1q/);
        });
    });

    describe('Multiple child derivations', () => {
        it('should derive multiple children with unique addresses', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const child0 = wallet.derivePath('m/0');
            const child1 = wallet.derivePath('m/1');
            const child2 = wallet.derivePath('m/2');

            // All addresses should be unique
            const addresses = [child0.p2tr, child1.p2tr, child2.p2tr];
            const uniqueAddresses = new Set(addresses);
            expect(uniqueAddresses.size).toBe(3);

            // All classical keys should be unique
            const classicalKeys = [
                child0.toPrivateKeyHex(),
                child1.toPrivateKeyHex(),
                child2.toPrivateKeyHex(),
            ];
            const uniqueClassicalKeys = new Set(classicalKeys);
            expect(uniqueClassicalKeys.size).toBe(3);

            // All quantum keys should be unique
            const quantumKeys = [
                child0.quantumPrivateKeyHex,
                child1.quantumPrivateKeyHex,
                child2.quantumPrivateKeyHex,
            ];
            const uniqueQuantumKeys = new Set(quantumKeys);
            expect(uniqueQuantumKeys.size).toBe(3);
        });
    });

    describe('Network preservation', () => {
        it('should maintain mainnet network in derived wallet', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);
            const child = wallet.derivePath('m/0');

            expect(child.network.bech32).toBe('bc');
            expect(child.p2tr).toMatch(/^bc1/);
        });

        it('should maintain testnet network in derived wallet', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.testnet, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);
            const child = wallet.derivePath('m/0');

            expect(child.network.bech32).toBe('tb');
            expect(child.p2tr).toMatch(/^tb1/);
        });

        it('should maintain regtest network in derived wallet', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.regtest, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);
            const child = wallet.derivePath('m/0');

            expect(child.network.bech32).toBe('bcrt');
            expect(child.p2tr).toMatch(/^bcrt1/);
        });
    });

    describe('Network-aware key derivation', () => {
        it('should derive different classical keys for different networks', () => {
            const mnemonicMainnet = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const mnemonicTestnet = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );

            const mainnetParent = mnemonicMainnet.derive(0);
            const testnetParent = mnemonicTestnet.derive(0);

            const mainnetChild = mainnetParent.derivePath('m/0');
            const testnetChild = testnetParent.derivePath('m/0');

            // Classical keys should differ between networks
            expect(mainnetChild.toPrivateKeyHex()).not.toBe(testnetChild.toPrivateKeyHex());
        });

        it('should derive different quantum keys for different networks', () => {
            const mnemonicMainnet = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const mnemonicTestnet = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );

            const mainnetParent = mnemonicMainnet.derive(0);
            const testnetParent = mnemonicTestnet.derive(0);

            const mainnetChild = mainnetParent.derivePath('m/0');
            const testnetChild = testnetParent.derivePath('m/0');

            // Quantum keys should differ between networks
            expect(mainnetChild.quantumPrivateKeyHex).not.toBe(testnetChild.quantumPrivateKeyHex);
        });
    });

    describe('Hardened paths', () => {
        it('should support hardened derivation paths', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const hardened1 = wallet.derivePath("m/0'");
            const hardened2 = wallet.derivePath("m/44'/0'/0'");

            expect(hardened1.p2tr).toBeDefined();
            expect(hardened2.p2tr).toBeDefined();
            expect(hardened1.p2tr).not.toBe(hardened2.p2tr);
        });
    });

    describe('Deterministic derivation', () => {
        it('should produce same results when using same mnemonic-derived wallet', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            // Derive the same path twice from the same wallet instance
            const child1 = wallet.derivePath('m/0/1');
            const child2 = wallet.derivePath('m/0/1');

            // Should produce identical results (deterministic)
            expect(child1.p2tr).toBe(child2.p2tr);
            expect(child1.p2wpkh).toBe(child2.p2wpkh);
            expect(child1.toPrivateKeyHex()).toBe(child2.toPrivateKeyHex());
            expect(child1.quantumPrivateKeyHex).toBe(child2.quantumPrivateKeyHex);
        });
    });

    describe('Deep path derivation', () => {
        it('should support deep BIP44-style paths', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const deepChild = wallet.derivePath("m/44'/0'/0'/0/5");

            expect(deepChild.p2tr).toBeDefined();
            expect(deepChild.p2tr).not.toBe(wallet.p2tr);
        });
    });
});
