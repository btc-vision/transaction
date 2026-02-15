import { describe, expect, it } from 'vitest';
import type { Wallet } from '../build/opnet.js';
import { AddressTypes, MLDSASecurityLevel, Mnemonic } from '../build/opnet.js';
import { networks } from '@btc-vision/bitcoin';

describe('Wallet.derivePath', () => {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    describe('Basic derivation', () => {
        it('should derive child wallet with unique addresses', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
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
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const child = wallet.derivePath('m/0');

            expect(child.p2tr).toMatch(/^bc1p/);
            expect(child.p2wpkh).toMatch(/^bc1q/);
        });
    });

    describe('Multiple child derivations', () => {
        it('should derive multiple children with unique addresses', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
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
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const child = wallet.derivePath('m/0');

            expect(child.network.bech32).toBe('bc');
            expect(child.p2tr).toMatch(/^bc1/);
        });

        it('should maintain testnet network in derived wallet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const child = wallet.derivePath('m/0');

            expect(child.network.bech32).toBe('tb');
            expect(child.p2tr).toMatch(/^tb1/);
        });

        it('should maintain regtest network in derived wallet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.regtest,
                MLDSASecurityLevel.LEVEL2,
            );
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
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
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
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
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
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const deepChild = wallet.derivePath("m/44'/0'/0'/0/5");

            expect(deepChild.p2tr).toBeDefined();
            expect(deepChild.p2tr).not.toBe(wallet.p2tr);
        });
    });
});

describe('Mnemonic.deriveOPWallet', () => {
    const testMnemonic =
        'episode frost someone page color giraffe match vanish sheriff veteran hub year pull save dizzy limb already turn reopen truth cradle rural wisdom change';
    const unisatExpectedAddress =
        'bcrt1phn6ej9ct038j722wdzkvsk7c6pmugtd5d3qnpwxc8g40zerf2ujs55tkz3';

    describe('P2TR (Taproot) derivation', () => {
        it('should match Unisat P2TR address for regtest', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.regtest,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0, 0, false);

            expect(wallet.p2tr).toBe(unisatExpectedAddress);
        });

        it('should derive P2TR with correct network prefix for mainnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

            expect(wallet.p2tr).toMatch(/^bc1p/);
        });

        it('should derive P2TR with correct network prefix for testnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

            expect(wallet.p2tr).toMatch(/^tb1p/);
        });
    });

    describe('P2WPKH (SegWit) derivation', () => {
        it('should derive P2WPKH addresses', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2WPKH, 0);

            expect(wallet.p2wpkh).toBeDefined();
            expect(wallet.p2wpkh).toMatch(/^bc1q/);
        });

        it("should use BIP84 path (m/84'/0'/0'/0/0)", () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2WPKH, 0);
            expect(wallet.p2wpkh).toBeDefined();
        });
    });

    describe('P2PKH (Legacy) derivation', () => {
        it('should derive legacy addresses', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2PKH, 0);

            expect(wallet.legacy).toBeDefined();
            expect(wallet.legacy).toMatch(/^1/);
        });
    });

    describe('Multiple address derivation', () => {
        it('should derive unique addresses for different indices', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet0 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
            const wallet1 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
            const wallet2 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 2);

            expect(wallet0.p2tr).not.toBe(wallet1.p2tr);
            expect(wallet1.p2tr).not.toBe(wallet2.p2tr);
            expect(wallet0.p2tr).not.toBe(wallet2.p2tr);
        });

        it('should derive deterministic addresses', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet1 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 5);
            const wallet2 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 5);

            expect(wallet1.p2tr).toBe(wallet2.p2tr);
            expect(wallet1.toPublicKeyHex()).toBe(wallet2.toPublicKeyHex());
        });
    });

    describe('Account and change address support', () => {
        it('should derive different addresses for different accounts', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const account0 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0, 0);
            const account1 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0, 1);

            expect(account0.p2tr).not.toBe(account1.p2tr);
        });

        it('should derive different addresses for change vs receiving', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const receiving = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0, 0, false);
            const change = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0, 0, true);

            expect(receiving.p2tr).not.toBe(change.p2tr);
        });
    });

    describe('Quantum key derivation', () => {
        it('should include quantum keys', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

            expect(wallet.quantumPublicKey).toBeDefined();
            expect(wallet.quantumPublicKey.length).toBe(1312); // LEVEL2 size
            expect(wallet.address.toHex()).toBeDefined();
        });

        it('should derive unique quantum keys for different indices', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet0 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
            const wallet1 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);

            expect(wallet0.address.toHex()).not.toBe(wallet1.address.toHex());
        });
    });

    describe('deriveMultipleUnisat', () => {
        it('should derive multiple wallets', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallets = mnemonic.deriveMultipleUnisat(AddressTypes.P2TR, 5);

            expect(wallets.length).toBe(5);
            expect((wallets[0] as Wallet).p2tr).toBeDefined();
            expect((wallets[4] as Wallet).p2tr).toBeDefined();
        });

        it('should derive unique addresses for each wallet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallets = mnemonic.deriveMultipleUnisat(AddressTypes.P2TR, 3);

            const addresses = wallets.map((w) => w.p2tr);
            const uniqueAddresses = new Set(addresses);

            expect(uniqueAddresses.size).toBe(3);
        });

        it('should support custom start index', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallets = mnemonic.deriveMultipleUnisat(AddressTypes.P2TR, 2, 5);
            const wallet5 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 5);

            expect((wallets[0] as Wallet).p2tr).toBe(wallet5.p2tr);
        });
    });

    describe('Error handling', () => {
        it('should throw error for unsupported address type', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );

            expect(() => {
                mnemonic.deriveOPWallet('INVALID_TYPE' as AddressTypes, 0);
            }).toThrow('Unsupported address type');
        });
    });

    describe('Network consistency', () => {
        it('should preserve network in derived wallet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

            expect(wallet.network.bech32).toBe('tb');
        });
    });

    describe('Security level preservation', () => {
        it('should maintain security level in derived wallet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL3,
            );

            const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

            expect(wallet.securityLevel).toBe(MLDSASecurityLevel.LEVEL3);
            expect(wallet.quantumPublicKey.length).toBe(1952); // LEVEL3 size
        });
    });
});
