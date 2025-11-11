import { describe, expect, it } from 'vitest';
import { MessageSigner, MLDSASecurityLevel, Mnemonic } from '../build/opnet.js';
import { networks } from '@btc-vision/bitcoin';

describe('MessageSigner Schnorr', () => {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    describe('sha256', () => {
        it('should hash a string message', () => {
            const message = 'Hello, OPNet!';
            const hash = MessageSigner.sha256(Buffer.from(message, 'utf-8'));

            expect(hash).toBeInstanceOf(Buffer);
            expect(hash.length).toBe(32);
        });

        it('should hash a Buffer message', () => {
            const message = Buffer.from('Hello, Buffer!', 'utf-8');
            const hash = MessageSigner.sha256(message);

            expect(hash).toBeInstanceOf(Buffer);
            expect(hash.length).toBe(32);
        });

        it('should hash a Uint8Array message', () => {
            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const hash = MessageSigner.sha256(message);

            expect(hash).toBeInstanceOf(Buffer);
            expect(hash.length).toBe(32);
        });

        it('should produce consistent hashes for same input', () => {
            const message = 'Test message';
            const hash1 = MessageSigner.sha256(Buffer.from(message, 'utf-8'));
            const hash2 = MessageSigner.sha256(Buffer.from(message, 'utf-8'));

            expect(hash1.toString('hex')).toBe(hash2.toString('hex'));
        });

        it('should produce different hashes for different inputs', () => {
            const message1 = 'Message 1';
            const message2 = 'Message 2';
            const hash1 = MessageSigner.sha256(Buffer.from(message1, 'utf-8'));
            const hash2 = MessageSigner.sha256(Buffer.from(message2, 'utf-8'));

            expect(hash1.toString('hex')).not.toBe(hash2.toString('hex'));
        });

        it('should hash empty message', () => {
            const message = Buffer.alloc(0);
            const hash = MessageSigner.sha256(message);

            expect(hash).toBeInstanceOf(Buffer);
            expect(hash.length).toBe(32);
        });
    });

    describe('signMessage - string input', () => {
        it('should sign a UTF-8 string message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBe(64); // Schnorr signatures are 64 bytes
            expect(signed.message).toBeInstanceOf(Uint8Array);
            expect(signed.message.length).toBe(32); // SHA-256 hash
        });

        it('should sign an empty string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a very long string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'A'.repeat(10000);
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a string with special characters', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`\n\t\r';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a Unicode string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '你好世界 🌍 مرحبا العالم';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });
    });

    describe('signMessage - Buffer input', () => {
        it('should sign a Buffer message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Hello, Buffer!', 'utf-8');
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBe(64);
            expect(signed.message).toBeInstanceOf(Uint8Array);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a Buffer with binary data', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a Buffer created from hex', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('deadbeef', 'hex');
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should sign an empty Buffer', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.alloc(0);
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });
    });

    describe('signMessage - Uint8Array input', () => {
        it('should sign a Uint8Array message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBe(64);
            expect(signed.message).toBeInstanceOf(Uint8Array);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a Uint8Array with all byte values', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array(256);
            for (let i = 0; i < 256; i++) {
                message[i] = i;
            }
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should sign an empty Uint8Array', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array(0);
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });
    });

    describe('signMessage - signature uniqueness', () => {
        it('should produce different signatures for different messages', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message1 = 'First message';
            const message2 = 'Second message';

            const signed1 = MessageSigner.signMessage(wallet.keypair, message1);
            const signed2 = MessageSigner.signMessage(wallet.keypair, message2);

            expect(Buffer.from(signed1.signature).toString('hex')).not.toBe(
                Buffer.from(signed2.signature).toString('hex'),
            );
        });

        it('should produce different signatures for different keypairs', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet1 = mnemonic.derive(0);
            const wallet2 = mnemonic.derive(1);

            const message = 'Same message';

            const signed1 = MessageSigner.signMessage(wallet1.keypair, message);
            const signed2 = MessageSigner.signMessage(wallet2.keypair, message);

            expect(Buffer.from(signed1.signature).toString('hex')).not.toBe(
                Buffer.from(signed2.signature).toString('hex'),
            );
        });

        it('should hash the message before signing', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const expectedHash = MessageSigner.sha256(Buffer.from(message, 'utf-8'));
            expect(Buffer.from(signed.message).toString('hex')).toBe(expectedHash.toString('hex'));
        });
    });

    describe('verifySignature - string input', () => {
        it('should verify a valid signature with string message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should verify signature with Unicode string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '你好世界 🌍';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should fail verification with wrong message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const wrongMessage = 'Wrong message';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                wrongMessage,
                signed.signature,
            );

            expect(isValid).toBe(false);
        });
    });

    describe('verifySignature - Buffer input', () => {
        it('should verify a valid signature with Buffer message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Hello, Buffer!', 'utf-8');
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should verify signature with binary Buffer', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from([0x00, 0x01, 0x02, 0xff]);
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });
    });

    describe('verifySignature - Uint8Array input', () => {
        it('should verify a valid signature with Uint8Array message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should verify signature with Uint8Array public key', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const publicKeyUint8 = new Uint8Array(wallet.keypair.publicKey);
            const isValid = MessageSigner.verifySignature(
                publicKeyUint8,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });
    });

    describe('verifySignature - error cases', () => {
        it('should throw error for invalid signature length', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const invalidSignature = Buffer.alloc(32); // Wrong length

            expect(() => {
                MessageSigner.verifySignature(wallet.keypair.publicKey, message, invalidSignature);
            }).toThrow('Invalid signature length');
        });

        it('should fail verification with wrong public key', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet1 = mnemonic.derive(0);
            const wallet2 = mnemonic.derive(1);

            const message = 'Test message';
            const signed = MessageSigner.signMessage(wallet1.keypair, message);

            const isValid = MessageSigner.verifySignature(
                wallet2.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(false);
        });

        it('should fail verification with corrupted signature', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const corruptedSignature = Buffer.from(signed.signature);
            corruptedSignature[0] ^= 0xff;

            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                corruptedSignature,
            );

            expect(isValid).toBe(false);
        });
    });

    describe('tweakAndSignMessage', () => {
        it('should sign a message with tweaked keypair', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Hello, Tweaked OPNet!';
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBe(64);
            expect(signed.message).toBeInstanceOf(Uint8Array);
            expect(signed.message.length).toBe(32);
        });

        it('should sign with tweaked key - string message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test tweaked';
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should sign with tweaked key - Buffer message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Test tweaked buffer', 'utf-8');
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should sign with tweaked key - Uint8Array message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            expect(signed.signature.length).toBe(64);
            expect(signed.message.length).toBe(32);
        });

        it('should produce different signature than non-tweaked', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Compare tweaked vs non-tweaked';
            const signed = MessageSigner.signMessage(wallet.keypair, message);
            const tweakedSigned = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            expect(Buffer.from(signed.signature).toString('hex')).not.toBe(
                Buffer.from(tweakedSigned.signature).toString('hex'),
            );
        });

        it('should work on different networks', () => {
            const networks_list = [networks.bitcoin, networks.testnet, networks.regtest];

            for (const network of networks_list) {
                const mnemonic = new Mnemonic(testMnemonic, '', network, MLDSASecurityLevel.LEVEL2);
                const wallet = mnemonic.derive(0);

                const message = 'Test network ' + network.bech32;
                const signed = MessageSigner.tweakAndSignMessage(wallet.keypair, message, network);

                expect(signed.signature.length).toBe(64);
                expect(signed.message.length).toBe(32);
            }
        });
    });

    describe('tweakAndVerifySignature', () => {
        it('should verify a tweaked signature', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test tweaked verification';
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            const isValid = MessageSigner.tweakAndVerifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should verify tweaked signature with Buffer message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Test tweaked buffer', 'utf-8');
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            const isValid = MessageSigner.tweakAndVerifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should verify tweaked signature with Uint8Array message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([5, 4, 3, 2, 1]);
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            const isValid = MessageSigner.tweakAndVerifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should fail verification with wrong message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Correct message';
            const wrongMessage = 'Wrong message';
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            const isValid = MessageSigner.tweakAndVerifySignature(
                wallet.keypair.publicKey,
                wrongMessage,
                signed.signature,
            );

            expect(isValid).toBe(false);
        });

        it('should fail verification with wrong public key', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet1 = mnemonic.derive(0);
            const wallet2 = mnemonic.derive(1);

            const message = 'Test message';
            const signed = MessageSigner.tweakAndSignMessage(
                wallet1.keypair,
                message,
                networks.bitcoin,
            );

            const isValid = MessageSigner.tweakAndVerifySignature(
                wallet2.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(false);
        });

        it('should not verify non-tweaked signature with tweakAndVerifySignature', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const isValid = MessageSigner.tweakAndVerifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(false);
        });

        it('should verify with Uint8Array public key', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const signed = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            const publicKeyUint8 = new Uint8Array(wallet.keypair.publicKey);
            const isValid = MessageSigner.tweakAndVerifySignature(
                publicKeyUint8,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });
    });

    describe('cross-validation between tweaked and non-tweaked', () => {
        it('should not cross-verify tweaked signature with regular verify', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const tweakedSigned = MessageSigner.tweakAndSignMessage(
                wallet.keypair,
                message,
                networks.bitcoin,
            );

            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                tweakedSigned.signature,
            );

            expect(isValid).toBe(false);
        });

        it('should verify regular signature with regular verify, not with tweaked verify', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Test message';
            const signed = MessageSigner.signMessage(wallet.keypair, message);

            const isValidRegular = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );
            const isValidTweaked = MessageSigner.tweakAndVerifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValidRegular).toBe(true);
            expect(isValidTweaked).toBe(false);
        });
    });

    describe('network-specific tweaked signatures', () => {
        it('should produce different tweaked signatures for different networks', () => {
            const message = 'Network test';

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

            const signedMainnet = MessageSigner.tweakAndSignMessage(
                walletMainnet.keypair,
                message,
                networks.bitcoin,
            );
            const signedTestnet = MessageSigner.tweakAndSignMessage(
                walletTestnet.keypair,
                message,
                networks.testnet,
            );

            // Signatures should be different
            expect(Buffer.from(signedMainnet.signature).toString('hex')).not.toBe(
                Buffer.from(signedTestnet.signature).toString('hex'),
            );

            // Each should verify with its own network's tweaked key
            expect(
                MessageSigner.tweakAndVerifySignature(
                    walletMainnet.keypair.publicKey,
                    message,
                    signedMainnet.signature,
                ),
            ).toBe(true);
            expect(
                MessageSigner.tweakAndVerifySignature(
                    walletTestnet.keypair.publicKey,
                    message,
                    signedTestnet.signature,
                ),
            ).toBe(true);
        });
    });

    describe('message format edge cases', () => {
        it('should handle messages with null bytes', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00]);
            const signed = MessageSigner.signMessage(wallet.keypair, message);
            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should handle very long messages', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'X'.repeat(100000);
            const signed = MessageSigner.signMessage(wallet.keypair, message);
            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });

        it('should handle messages with emoji', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '🚀🌙⭐🪐💫';
            const signed = MessageSigner.signMessage(wallet.keypair, message);
            const isValid = MessageSigner.verifySignature(
                wallet.keypair.publicKey,
                message,
                signed.signature,
            );

            expect(isValid).toBe(true);
        });
    });
});
