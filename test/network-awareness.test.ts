import { describe, it, expect } from 'vitest';
import { Mnemonic, MLDSASecurityLevel } from '../build/opnet.js';
import { networks } from '@btc-vision/bitcoin';

describe('Network Awareness', () => {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    describe('Mnemonic network awareness', () => {
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

            const walletMainnet = mnemonicMainnet.derive(0);
            const walletTestnet = mnemonicTestnet.derive(0);

            // Classical private keys should be different
            expect(walletMainnet.toPrivateKeyHex()).not.toBe(walletTestnet.toPrivateKeyHex());
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

            const walletMainnet = mnemonicMainnet.derive(0);
            const walletTestnet = mnemonicTestnet.derive(0);

            // Quantum private keys should be different
            expect(walletMainnet.quantumPrivateKeyHex).not.toBe(walletTestnet.quantumPrivateKeyHex);
        });

        it('should generate correct address prefixes for mainnet', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            expect(wallet.p2tr).toMatch(/^bc1/);
            expect(wallet.p2wpkh).toMatch(/^bc1/);
        });

        it('should generate correct address prefixes for testnet', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.testnet, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            expect(wallet.p2tr).toMatch(/^tb1/);
            expect(wallet.p2wpkh).toMatch(/^tb1/);
        });

        it('should generate correct address prefixes for regtest', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.regtest, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            expect(wallet.p2tr).toMatch(/^bcrt1/);
            expect(wallet.p2wpkh).toMatch(/^bcrt1/);
        });
    });

    describe('Testnet and regtest parity', () => {
        it('should derive same keys for testnet and regtest (BIP32 behavior)', () => {
            const mnemonicTestnet = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const mnemonicRegtest = new Mnemonic(
                testMnemonic,
                '',
                networks.regtest,
                MLDSASecurityLevel.LEVEL2,
            );

            const walletTestnet = mnemonicTestnet.derive(0);
            const walletRegtest = mnemonicRegtest.derive(0);

            // Testnet and regtest should have same private keys (BIP32 uses same version bytes)
            expect(walletTestnet.toPrivateKeyHex()).toBe(walletRegtest.toPrivateKeyHex());
            expect(walletTestnet.quantumPrivateKeyHex).toBe(walletRegtest.quantumPrivateKeyHex);

            // But addresses should differ due to different prefixes
            expect(walletTestnet.p2tr).not.toBe(walletRegtest.p2tr);
            expect(walletTestnet.p2wpkh).not.toBe(walletRegtest.p2wpkh);
        });
    });

    describe('Network preservation through derivation', () => {
        it('should preserve mainnet through derivePath', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const parent = mnemonic.derive(0);
            const child = parent.derivePath('m/0');

            expect(child.network.bech32).toBe('bc');
            expect(child.p2tr).toMatch(/^bc1/);
        });

        it('should preserve testnet through derivePath', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.testnet, MLDSASecurityLevel.LEVEL2);
            const parent = mnemonic.derive(0);
            const child = parent.derivePath('m/0');

            expect(child.network.bech32).toBe('tb');
            expect(child.p2tr).toMatch(/^tb1/);
        });

        it('should preserve regtest through derivePath', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.regtest, MLDSASecurityLevel.LEVEL2);
            const parent = mnemonic.derive(0);
            const child = parent.derivePath('m/0');

            expect(child.network.bech32).toBe('bcrt');
            expect(child.p2tr).toMatch(/^bcrt1/);
        });
    });
});
