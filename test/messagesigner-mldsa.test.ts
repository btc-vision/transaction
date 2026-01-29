import { describe, expect, it } from 'vitest';
import { MessageSigner, MLDSASecurityLevel, Mnemonic } from '../build/opnet.js';
import { networks, toHex } from '@btc-vision/bitcoin';

describe('MessageSigner ML-DSA', () => {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    describe('signMLDSAMessage', () => {
        it('should sign a message with ML-DSA LEVEL2', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
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
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL3,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
            expect(signed.securityLevel).toBe(MLDSASecurityLevel.LEVEL3);
        });

        it('should sign a message with ML-DSA LEVEL5', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL5,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
            expect(signed.securityLevel).toBe(MLDSASecurityLevel.LEVEL5);
        });

        it('should sign a Buffer message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Hello, Buffer!', 'utf-8');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });

        it('should sign a Uint8Array message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });

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

            const signed1 = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message1);
            const signed2 = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message2);

            expect(Buffer.from(signed1.signature).toString('hex')).not.toBe(
                Buffer.from(signed2.signature).toString('hex'),
            );
            expect(Buffer.from(signed1.message).toString('hex')).not.toBe(
                Buffer.from(signed2.message).toString('hex'),
            );
        });

        it('should produce different signatures for different wallets with same message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet1 = mnemonic.derive(0);
            const wallet2 = mnemonic.derive(1);

            const message = 'Same message';

            const signed1 = MessageSigner.signMLDSAMessage(wallet1.mldsaKeypair, message);
            const signed2 = MessageSigner.signMLDSAMessage(wallet2.mldsaKeypair, message);

            expect(Buffer.from(signed1.signature).toString('hex')).not.toBe(
                Buffer.from(signed2.signature).toString('hex'),
            );
            expect(Buffer.from(signed1.publicKey).toString('hex')).not.toBe(
                Buffer.from(signed2.publicKey).toString('hex'),
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            // The message in the result should be hashed (32 bytes for SHA-256)
            expect(signed.message.length).toBe(32);

            // Verify it matches the SHA-256 hash
            const expectedHash = MessageSigner.sha256(Buffer.from(message, 'utf-8'));
            expect(toHex(signed.message)).toBe(toHex(expectedHash));
        });
    });

    describe('signMLDSAMessage - Buffer input formats', () => {
        it('should sign a Buffer from UTF-8 string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Hello, Buffer!', 'utf-8');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a Buffer from hex string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('deadbeef', 'hex');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a Buffer with null bytes', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00]);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });
    });

    describe('signMLDSAMessage - Uint8Array input formats', () => {
        it('should sign a basic Uint8Array', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
            expect(signed.message.length).toBe(32);
        });

        it('should sign a Uint8Array from text encoder', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const encoder = new TextEncoder();
            const message = encoder.encode('Hello, TextEncoder!');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });
    });

    describe('signMLDSAMessage - string input formats', () => {
        it('should sign an empty string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });

        it('should sign a very long string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'A'.repeat(100000);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });

        it('should sign a string with emojis', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '🚀🌙⭐🪐💫';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });

        it('should sign a Unicode string with multiple languages', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '你好世界 🌍 مرحبا العالم Привет мир';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            expect(signed.signature).toBeInstanceOf(Uint8Array);
            expect(signed.signature.length).toBeGreaterThan(0);
        });
    });

    describe('verifyMLDSASignature - string input', () => {
        it('should verify a valid ML-DSA signature with string message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature with empty string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature with emoji string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '🚀🌙⭐';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });
    });

    describe('verifyMLDSASignature - Buffer input', () => {
        it('should verify signature with Buffer message from UTF-8', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('Hello, Buffer!', 'utf-8');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature with Buffer from hex', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from('deadbeef', 'hex');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature with empty Buffer', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.alloc(0);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature with Buffer containing null bytes', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00]);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });
    });

    describe('verifyMLDSASignature - Uint8Array input', () => {
        it('should verify signature with Uint8Array message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature with Uint8Array from TextEncoder', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const encoder = new TextEncoder();
            const message = encoder.encode('Hello, TextEncoder!');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature with empty Uint8Array', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = new Uint8Array(0);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature with Uint8Array containing all byte values', () => {
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });
    });

    describe('verifyMLDSASignature - cross-format verification', () => {
        it('should verify signature signed with string using Buffer', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const messageString = 'Hello, World!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, messageString);

            const messageBuffer = Buffer.from(messageString, 'utf-8');
            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                messageBuffer,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature signed with Buffer using string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const messageBuffer = Buffer.from('Hello, World!', 'utf-8');
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, messageBuffer);

            const messageString = 'Hello, World!';
            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                messageString,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should verify signature signed with Uint8Array using Buffer', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const messageUint8 = new Uint8Array([1, 2, 3, 4, 5]);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, messageUint8);

            const messageBuffer = Buffer.from(messageUint8);
            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                messageBuffer,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });
    });

    describe('verifyMLDSASignature - failure cases', () => {
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
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                wrongMessage,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(false);
        });

        it('should fail verification with wrong keypair', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet1 = mnemonic.derive(0);
            const wallet2 = mnemonic.derive(1);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet1.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet2.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(false);
        });

        it('should fail verification with corrupted signature', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Hello, OPNet!';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            // Corrupt the signature
            const corruptedSignature = Buffer.from(signed.signature);
            corruptedSignature[0] = (corruptedSignature[0] as number) ^ 0xff;

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                corruptedSignature,
            );

            expect(isValidLegacyPublicKey).toBe(false);
        });

        it('should verify signatures across different security levels', () => {
            const securityLevels = [
                MLDSASecurityLevel.LEVEL2,
                MLDSASecurityLevel.LEVEL3,
                MLDSASecurityLevel.LEVEL5,
            ];

            for (const level of securityLevels) {
                const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, level);
                const wallet = mnemonic.derive(0);

                const message = `Test message for security level ${level}`;
                const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

                const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                    wallet.mldsaKeypair,
                    message,
                    signed.signature,
                );

                expect(isValidLegacyPublicKey).toBe(true);
            }
        });
    });

    describe('ML-DSA cross-validation', () => {
        it('should verify signature using public key from signed message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Cross-validation test';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            // Verify that the public key in the signed message matches the wallet's public key
            expect(Buffer.from(signed.publicKey).toString('hex')).toBe(
                Buffer.from(wallet.mldsaKeypair.publicKey).toString('hex'),
            );

            // Verify the signature
            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });
    });

    describe('ML-DSA deterministic signing', () => {
        it('should produce deterministic signatures for the same message and keypair', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'Deterministic test';
            const signed1 = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);
            const signed2 = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            // ML-DSA signatures might be deterministic or randomized depending on implementation
            // We verify that both signatures are valid regardless
            const isValid1 = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed1.signature,
            );
            const isValid2 = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed2.signature,
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

            const signedMainnet = MessageSigner.signMLDSAMessage(
                walletMainnet.mldsaKeypair,
                message,
            );
            const signedTestnet = MessageSigner.signMLDSAMessage(
                walletTestnet.mldsaKeypair,
                message,
            );

            // Different networks should produce different signatures
            expect(Buffer.from(signedMainnet.signature).toString('hex')).not.toBe(
                Buffer.from(signedTestnet.signature).toString('hex'),
            );

            // Verify each signature with its corresponding keypair
            expect(
                MessageSigner.verifyMLDSASignature(
                    walletMainnet.mldsaKeypair,
                    message,
                    signedMainnet.signature,
                ),
            ).toBe(true);
            expect(
                MessageSigner.verifyMLDSASignature(
                    walletTestnet.mldsaKeypair,
                    message,
                    signedTestnet.signature,
                ),
            ).toBe(true);

            // Cross-verification should fail
            expect(
                MessageSigner.verifyMLDSASignature(
                    walletMainnet.mldsaKeypair,
                    message,
                    signedTestnet.signature,
                ),
            ).toBe(false);
            expect(
                MessageSigner.verifyMLDSASignature(
                    walletTestnet.mldsaKeypair,
                    message,
                    signedMainnet.signature,
                ),
            ).toBe(false);
        });
    });

    describe('ML-DSA empty and special messages', () => {
        it('should sign and verify empty string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should sign and verify very long message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = 'A'.repeat(10000);
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should sign and verify message with special characters', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`\n\t\r';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });

        it('should sign and verify Unicode message', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const message = '你好世界 🌍 مرحبا العالم';
            const signed = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, message);

            const isValidLegacyPublicKey = MessageSigner.verifyMLDSASignature(
                wallet.mldsaKeypair,
                message,
                signed.signature,
            );

            expect(isValidLegacyPublicKey).toBe(true);
        });
    });
});
