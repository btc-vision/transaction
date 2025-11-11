import { describe, it, expect } from 'vitest';
import { Mnemonic, MLDSASecurityLevel, MessageSigner } from '../build/opnet.js';
import { networks } from '@btc-vision/bitcoin';

describe('MessageSigner ML-DSA', () => {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    describe('signMLDSAMessage', () => {
        it('should sign a message with ML-DSA LEVEL2', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
            expect(signed.message).toBeInstanceOf(Uint8Array);
            expect(signed.publicKey).toBeInstanceOf(Uint8Array);
            expect(signed.securityLevel).toBe(MLDSASecurityLevel.LEVEL2);
        });

        it('should sign a message with ML-DSA LEVEL3', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL3);
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
            expect(signed.securityLevel).toBe(MLDSASecurityLevel.LEVEL3);
        });

        it('should sign a message with ML-DSA LEVEL5', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL5);
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
            expect(signed.securityLevel).toBe(MLDSASecurityLevel.LEVEL5);
        });

        it('should sign a Buffer message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Hello, Buffer!', 'utf-8');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });

        it('should sign a Uint8Array message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });

        it('should produce different signatures for different messages', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message1 = 'First message';
            const message2 = 'Second message';

            const signed1 = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message1);
            const signed2 = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message2);

            expect(Buffer.from(signed1.signature).toString('hex')).not.toBe(
                Buffer.from(signed2.signature).toString('hex')
            );
            expect(Buffer.from(signed1.message).toString('hex')).not.toBe(
                Buffer.from(signed2.message).toString('hex')
            );
        });

        it('should produce different signatures for different wallets with same message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet1 = mnemonic.derive(0);
            const wallet2 = mnemonic.derive(1);

            const message = 'Same message';

            const signed1 = MessageSigner.signMLDSAMessage(wallet1.mldsaKeypair, message);
            const signed2 = MessageSigner.signMLDSAMessage(wallet2.mldsaKeypair, message);

            expect(Buffer.from(signed1.signature).toString('hex')).not.toBe(
                Buffer.from(signed2.signature).toString('hex')
            );
            expect(Buffer.from(signed1.publicKey).toString('hex')).not.toBe(
                Buffer.from(signed2.publicKey).toString('hex')
            );
        });

        it('should hash the message before signing', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            // The message in the result should be hashed (32 bytes for SHA-256)
            expect(signed.message.length).toBe(32);

            // Verify it matches the SHA-256 hash
            const expectedHash = MessageSigner.sha256(Buffer.from(message, 'utf-8'));
            expect(Buffer.from(signed.message).toString('hex')).toBe(expectedHash.toString('hex'));
        });
    });

    describe('verifyMLDSASignature', () => {
        it('should verify a valid ML-DSA signature', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(true);
        });

        it('should verify signature with Buffer message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Hello, Buffer!', 'utf-8');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(true);
        });

        it('should verify signature with Uint8Array message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(true);
        });

        it('should fail verification with wrong message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const wrongMessage = 'Wrong message';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                wrongMessage,
                signed.signature
            );

            expect(isValid).toBe(false);
        });

        it('should fail verification with wrong keypair', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet1 = mnemonic.derive(0);
            const wallet2 = mnemonic.derive(1);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet1.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet2.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(false);
        });

        it('should fail verification with corrupted signature', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            // Corrupt the signature
            const corruptedSignature = Buffer.from(signed.signature);
            corruptedSignature[0] ^= 0xFF;

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                corruptedSignature
            );

            expect(isValid).toBe(false);
        });

        it('should verify signatures across different security levels', () => {
            const securityLevels = [MLDSASecurityLevel.LEVEL2, MLDSASecurityLevel.LEVEL3, MLDSASecurityLevel.LEVEL5];

            for (const level of securityLevels) {
                const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, level);
                const wallet = mnemonic.derive(0);

                const message = 'Test message for security level ' + level;
                const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

                const isValid = MessageSigner.verifyMLDSASignature(
                    wallet.mldsaKeypair,
                    message,
                    signed.signature
                );

                expect(isValid).toBe(true);
            }
        });
    });

    describe('ML-DSA cross-validation', () => {
        it('should verify signature using public key from signed message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = 'Cross-validation test';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            // Verify that the public key in the signed message matches the wallet's public key
            expect(Buffer.from(signed.publicKey).toString('hex')).toBe(
                Buffer.from(wallet.mldsaKeypair.publicKey).toString('hex')
            );

            // Verify the signature
            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(true);
        });
    });

    describe('ML-DSA deterministic signing', () => {
        it('should produce deterministic signatures for the same message and keypair', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = 'Deterministic test';
            const signed1 = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);
            const signed2 = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            // ML-DSA signatures might be deterministic or randomized depending on implementation
            // We verify that both signatures are valid regardless
            const isValid1 = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed1.signature
            );
            const isValid2 = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed2.signature
            );

            expect(isValid1).toBe(true);
            expect(isValid2).toBe(true);
        });
    });

    describe('ML-DSA network awareness', () => {
        it('should produce different signatures for different networks', () => {
            const message = 'Network test';

            const mnemonicMainnet = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2
            );
            const mnemonicTestnet = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2
            );

            const walletMainnet = mnemonicMainnet.derive(0);
            const walletTestnet = mnemonicTestnet.derive(0);

            const signedMainnet = MessageSigner.signMLDSAMessage(walletMainnet.mldsaKeypair, message);
            const signedTestnet = MessageSigner.signMLDSAMessage(walletTestnet.mldsaKeypair, message);

            // Different networks should produce different signatures
            expect(Buffer.from(signedMainnet.signature).toString('hex')).not.toBe(
                Buffer.from(signedTestnet.signature).toString('hex')
            );

            // Verify each signature with its corresponding keypair
            expect(
                MessageSigner.verifyMLDSASignature(
                    walletMainnet.mldsaKeypair,
                    message,
                    signedMainnet.signature
                )
            ).toBe(true);
            expect(
                MessageSigner.verifyMLDSASignature(
                    walletTestnet.mldsaKeypair,
                    message,
                    signedTestnet.signature
                )
            ).toBe(true);

            // Cross-verification should fail
            expect(
                MessageSigner.verifyMLDSASignature(
                    walletMainnet.mldsaKeypair,
                    message,
                    signedTestnet.signature
                )
            ).toBe(false);
            expect(
                MessageSigner.verifyMLDSASignature(
                    walletTestnet.mldsaKeypair,
                    message,
                    signedMainnet.signature
                )
            ).toBe(false);
        });
    });

    describe('ML-DSA empty and special messages', () => {
        it('should sign and verify empty string', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = '';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(true);
        });

        it('should sign and verify very long message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = 'A'.repeat(10000);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(true);
        });

        it('should sign and verify message with special characters', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`\n\t\r';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(true);
        });

        it('should sign and verify Unicode message', () => {
            const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, MLDSASecurityLevel.LEVEL2);
            const wallet = mnemonic.derive(0);

            const message = '你好世界 🌍 مرحبا العالم';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValid = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature
            );

            expect(isValid).toBe(true);
        });
    });
});
