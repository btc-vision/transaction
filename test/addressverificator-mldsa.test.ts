import { describe, expect, it } from 'vitest';
import { AddressTypes, AddressVerificator, MLDSASecurityLevel, Mnemonic } from '../build/opnet.js';
import { networks } from '@btc-vision/bitcoin';

describe('AddressVerificator ML-DSA Support', () => {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    describe('isValidMLDSAPublicKey', () => {
        it('should validate ML-DSA-44 (Level 2) public key from hex string', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const publicKeyHex = wallet.quantumPublicKeyHex;

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(publicKeyHex);

            expect(securityLevel).toBe(MLDSASecurityLevel.LEVEL2);
        });

        it('should validate ML-DSA-44 (Level 2) public key from hex string with 0x prefix', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const publicKeyHex = '0x' + wallet.quantumPublicKeyHex;

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(publicKeyHex);

            expect(securityLevel).toBe(MLDSASecurityLevel.LEVEL2);
        });

        it('should validate ML-DSA-44 (Level 2) public key from Buffer', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const publicKeyBuffer = wallet.quantumPublicKey;

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(publicKeyBuffer);

            expect(securityLevel).toBe(MLDSASecurityLevel.LEVEL2);
        });

        it('should validate ML-DSA-44 (Level 2) public key from Uint8Array', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const publicKeyArray = new Uint8Array(wallet.quantumPublicKey);

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(publicKeyArray);

            expect(securityLevel).toBe(MLDSASecurityLevel.LEVEL2);
        });

        it('should validate ML-DSA-65 (Level 3) public key', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL3,
            );
            const wallet = mnemonic.derive(0);
            const publicKeyHex = wallet.quantumPublicKeyHex;

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(publicKeyHex);

            expect(securityLevel).toBe(MLDSASecurityLevel.LEVEL3);
        });

        it('should validate ML-DSA-65 (Level 3) public key from Buffer', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL3,
            );
            const wallet = mnemonic.derive(0);
            const publicKeyBuffer = wallet.quantumPublicKey;

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(publicKeyBuffer);

            expect(securityLevel).toBe(MLDSASecurityLevel.LEVEL3);
        });

        it('should validate ML-DSA-87 (Level 5) public key', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL5,
            );
            const wallet = mnemonic.derive(0);
            const publicKeyHex = wallet.quantumPublicKeyHex;

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(publicKeyHex);

            expect(securityLevel).toBe(MLDSASecurityLevel.LEVEL5);
        });

        it('should validate ML-DSA-87 (Level 5) public key from Buffer', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL5,
            );
            const wallet = mnemonic.derive(0);
            const publicKeyBuffer = wallet.quantumPublicKey;

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(publicKeyBuffer);

            expect(securityLevel).toBe(MLDSASecurityLevel.LEVEL5);
        });

        it('should reject invalid hex string', () => {
            const invalidHex = 'not a valid hex string';
            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(invalidHex);

            expect(securityLevel).toBeNull();
        });

        it('should reject public key with wrong length', () => {
            const wrongLength = 'a'.repeat(100);
            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(wrongLength);

            expect(securityLevel).toBeNull();
        });

        it('should reject empty string', () => {
            const securityLevel = AddressVerificator.isValidMLDSAPublicKey('');

            expect(securityLevel).toBeNull();
        });

        it('should reject empty Buffer', () => {
            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(Buffer.alloc(0));

            expect(securityLevel).toBeNull();
        });

        it('should reject classical public key (33 bytes)', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const classicalPublicKey = wallet.publicKey; // 33 bytes

            const securityLevel = AddressVerificator.isValidMLDSAPublicKey(classicalPublicKey);

            expect(securityLevel).toBeNull();
        });

        it('should verify all valid ML-DSA lengths', () => {
            // Test all three security levels
            const levels = [
                MLDSASecurityLevel.LEVEL2,
                MLDSASecurityLevel.LEVEL3,
                MLDSASecurityLevel.LEVEL5,
            ];

            for (const level of levels) {
                const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, level);
                const wallet = mnemonic.derive(0);

                const securityLevelHex = AddressVerificator.isValidMLDSAPublicKey(
                    wallet.quantumPublicKeyHex,
                );
                const securityLevelBuffer = AddressVerificator.isValidMLDSAPublicKey(
                    wallet.quantumPublicKey,
                );

                expect(securityLevelHex).toBe(level);
                expect(securityLevelBuffer).toBe(level);
            }
        });
    });

    describe('isValidP2OPAddress', () => {
        it('should validate mainnet P2OP address', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2opAddress = wallet.address.p2op(networks.bitcoin);

            const isValid = AddressVerificator.isValidP2OPAddress(p2opAddress, networks.bitcoin);

            expect(isValid).toBe(true);
        });

        it('should validate testnet P2OP address', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2opAddress = wallet.address.p2op(networks.testnet);

            const isValid = AddressVerificator.isValidP2OPAddress(p2opAddress, networks.testnet);

            expect(isValid).toBe(true);
        });

        it('should validate regtest P2OP address', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.regtest,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2opAddress = wallet.address.p2op(networks.regtest);

            const isValid = AddressVerificator.isValidP2OPAddress(p2opAddress, networks.regtest);

            expect(isValid).toBe(true);
        });

        it('should reject P2TR address as P2OP', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2trAddress = wallet.p2tr;

            const isValid = AddressVerificator.isValidP2OPAddress(p2trAddress, networks.bitcoin);

            expect(isValid).toBe(false);
        });

        it('should reject P2WPKH address as P2OP', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2wpkhAddress = wallet.p2wpkh;

            const isValid = AddressVerificator.isValidP2OPAddress(p2wpkhAddress, networks.bitcoin);

            expect(isValid).toBe(false);
        });

        it('should reject invalid address string', () => {
            const invalidAddress = 'not a valid address';
            const isValid = AddressVerificator.isValidP2OPAddress(invalidAddress, networks.bitcoin);

            expect(isValid).toBe(false);
        });

        it('should reject empty string', () => {
            const isValid = AddressVerificator.isValidP2OPAddress('', networks.bitcoin);

            expect(isValid).toBe(false);
        });

        it('should reject address on wrong network', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2opAddress = wallet.address.p2op(networks.bitcoin);

            // Try to validate mainnet address on testnet
            const isValid = AddressVerificator.isValidP2OPAddress(p2opAddress, networks.testnet);

            expect(isValid).toBe(false);
        });
    });

    describe('detectAddressType - P2OP support', () => {
        it('should detect mainnet P2OP address type', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2opAddress = wallet.address.p2op(networks.bitcoin);

            const addressType = AddressVerificator.detectAddressType(p2opAddress, networks.bitcoin);

            expect(addressType).toBe(AddressTypes.P2OP);
        });

        it('should detect testnet P2OP address type', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2opAddress = wallet.address.p2op(networks.testnet);

            const addressType = AddressVerificator.detectAddressType(p2opAddress, networks.testnet);

            expect(addressType).toBe(AddressTypes.P2OP);
        });

        it('should detect regtest P2OP address type', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.regtest,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2opAddress = wallet.address.p2op(networks.regtest);

            const addressType = AddressVerificator.detectAddressType(p2opAddress, networks.regtest);

            expect(addressType).toBe(AddressTypes.P2OP);
        });

        it('should not confuse P2OP with P2TR', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const p2opAddress = wallet.address.p2op(networks.bitcoin);
            const p2trAddress = wallet.p2tr;

            const p2opType = AddressVerificator.detectAddressType(p2opAddress, networks.bitcoin);
            const p2trType = AddressVerificator.detectAddressType(p2trAddress, networks.bitcoin);

            expect(p2opType).toBe(AddressTypes.P2OP);
            expect(p2trType).toBe(AddressTypes.P2TR);
            expect(p2opType).not.toBe(p2trType);
        });

        it('should not confuse P2OP with P2WPKH', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const p2opAddress = wallet.address.p2op(networks.bitcoin);
            const p2wpkhAddress = wallet.p2wpkh;

            const p2opType = AddressVerificator.detectAddressType(p2opAddress, networks.bitcoin);
            const p2wpkhType = AddressVerificator.detectAddressType(
                p2wpkhAddress,
                networks.bitcoin,
            );

            expect(p2opType).toBe(AddressTypes.P2OP);
            expect(p2wpkhType).toBe(AddressTypes.P2WPKH);
            expect(p2opType).not.toBe(p2wpkhType);
        });

        it('should detect P2OP for different security levels', () => {
            const levels = [
                MLDSASecurityLevel.LEVEL2,
                MLDSASecurityLevel.LEVEL3,
                MLDSASecurityLevel.LEVEL5,
            ];

            for (const level of levels) {
                const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, level);
                const wallet = mnemonic.derive(0);
                const p2opAddress = wallet.address.p2op(networks.bitcoin);

                const addressType = AddressVerificator.detectAddressType(
                    p2opAddress,
                    networks.bitcoin,
                );

                expect(addressType).toBe(AddressTypes.P2OP);
            }
        });

        it('should return null for invalid P2OP address on wrong network', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2opAddress = wallet.address.p2op(networks.bitcoin);

            // Try to detect mainnet address on testnet
            const addressType = AddressVerificator.detectAddressType(p2opAddress, networks.testnet);

            expect(addressType).toBeNull();
        });
    });

    describe('ML-DSA integration with other address types', () => {
        it('should correctly identify different address types from same wallet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const p2trType = AddressVerificator.detectAddressType(wallet.p2tr, networks.bitcoin);
            const p2wpkhType = AddressVerificator.detectAddressType(
                wallet.p2wpkh,
                networks.bitcoin,
            );
            const p2opType = AddressVerificator.detectAddressType(
                wallet.address.p2op(networks.bitcoin),
                networks.bitcoin,
            );

            expect(p2trType).toBe(AddressTypes.P2TR);
            expect(p2wpkhType).toBe(AddressTypes.P2WPKH);
            expect(p2opType).toBe(AddressTypes.P2OP);
        });

        it('should validate classical and ML-DSA public keys separately', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const classicalValid = AddressVerificator.isValidPublicKey(
                wallet.toPublicKeyHex(),
                networks.bitcoin,
            );
            const mldsaLevel = AddressVerificator.isValidMLDSAPublicKey(wallet.quantumPublicKeyHex);

            expect(classicalValid).toBe(true);
            expect(mldsaLevel).toBe(MLDSASecurityLevel.LEVEL2);
        });
    });
});
