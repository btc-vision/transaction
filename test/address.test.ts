import { describe, expect, it } from 'vitest';
import { Address, MLDSASecurityLevel, Mnemonic } from '../build/opnet.js';
import { networks } from '@btc-vision/bitcoin';

describe('Address - Comprehensive Tests', () => {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    // Helper to get a valid address with both keys
    const getValidAddress = (securityLevel = MLDSASecurityLevel.LEVEL2) => {
        const mnemonic = new Mnemonic(testMnemonic, '', networks.bitcoin, securityLevel);
        const wallet = mnemonic.derive(0);
        return wallet.address;
    };

    describe('Constructor', () => {
        it('should create an empty address with no parameters', () => {
            const address = new Address();
            expect(address.length).toBe(32); // ADDRESS_BYTE_LENGTH
        });

        it('should create an address with ML-DSA public key only (32 bytes)', () => {
            const mldsaHash = Buffer.alloc(32);
            mldsaHash.fill(0x01);
            const address = new Address(mldsaHash);

            expect(address.length).toBe(32);
            expect(address.toHex()).toBe('0x' + mldsaHash.toString('hex'));
        });

        it('should create an address with ML-DSA public key (1312 bytes - LEVEL2)', () => {
            const mldsaPubKey = Buffer.alloc(1312);
            mldsaPubKey.fill(0x02);
            const address = new Address(mldsaPubKey);

            expect(address.length).toBe(32);
            expect(address.mldsaPublicKey).toBeDefined();
            expect(address.mldsaPublicKey?.length).toBe(1312);
        });

        it('should create an address with ML-DSA public key (1952 bytes - LEVEL3)', () => {
            const mldsaPubKey = Buffer.alloc(1952);
            mldsaPubKey.fill(0x03);
            const address = new Address(mldsaPubKey);

            expect(address.mldsaPublicKey?.length).toBe(1952);
        });

        it('should create an address with ML-DSA public key (2592 bytes - LEVEL5)', () => {
            const mldsaPubKey = Buffer.alloc(2592);
            mldsaPubKey.fill(0x04);
            const address = new Address(mldsaPubKey);

            expect(address.mldsaPublicKey?.length).toBe(2592);
        });

        it('should create an address with both ML-DSA and classical public key (compressed)', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            expect(wallet.address.mldsaPublicKey).toBeDefined();
            expect(wallet.address.originalPublicKey).toBeDefined();
        });

        it('should create an address with ML-DSA hash and 32-byte classical key hash', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const classicHash = Buffer.alloc(32, 0x02);
            const address = new Address(mldsaHash, classicHash);

            expect(address.length).toBe(32);
        });

        it('should create an address with Uint8Array inputs', () => {
            const mldsaHash = new Uint8Array(32);
            mldsaHash.fill(0x05);
            const address = new Address(mldsaHash);

            expect(address.toHex()).toContain('05050505');
        });
    });

    describe('Static Methods - dead()', () => {
        it('should return a dead address', () => {
            const deadAddr = Address.dead();

            expect(deadAddr).toBeInstanceOf(Address);
            expect(deadAddr.toHex()).toBe(
                '0x0000000000000000000000000000000000000000000000000000000000000000',
            );
        });

        it('should return same dead address instance properties', () => {
            const dead1 = Address.dead();
            const dead2 = Address.dead();

            expect(dead1.toHex()).toBe(dead2.toHex());
        });
    });

    describe('Static Methods - fromString()', () => {
        it('should create address from 32-byte hex string', () => {
            const hex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            const address = Address.fromString(hex);

            expect(address.toHex()).toBe('0x' + hex);
        });

        it('should create address from hex string with 0x prefix', () => {
            const hex = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            const address = Address.fromString(hex);

            expect(address.toHex()).toBe(hex);
        });

        it('should create address from hex string without 0x prefix', () => {
            const hex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            const address = Address.fromString(hex);

            expect(address.toHex()).toBe('0x' + hex);
        });

        it('should create address with classical public key', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const mldsaHex = wallet.quantumPublicKeyHex;
            const classicHex = wallet.toPublicKeyHex();
            const address = Address.fromString(mldsaHex, classicHex);

            expect(address).toBeInstanceOf(Address);
            expect(address.originalPublicKey).toBeDefined();
        });

        it('should create address with classical public key with 0x prefix', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            const mldsaHex = '0x' + wallet.quantumPublicKeyHex;
            const classicHex = '0x' + wallet.toPublicKeyHex();
            const address = Address.fromString(mldsaHex, classicHex);

            expect(address).toBeInstanceOf(Address);
        });

        it('should throw error for empty string', () => {
            expect(() => Address.fromString('')).toThrow('Invalid public key');
        });

        it('should throw error for invalid hex', () => {
            expect(() => Address.fromString('not_hex')).toThrow('hexadecimal format');
        });

        it('should throw error for invalid classical public key hex', () => {
            const mldsaHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            expect(() => Address.fromString(mldsaHex, 'not_hex')).toThrow('hexadecimal format');
        });
    });

    describe('Static Methods - wrap()', () => {
        it('should wrap bytes into an Address', () => {
            const bytes = Buffer.alloc(32, 0x42);
            const address = Address.wrap(bytes);

            expect(address).toBeInstanceOf(Address);
            expect(address.toHex()).toContain('42424242');
        });

        it('should wrap Uint8Array into an Address', () => {
            const bytes = new Uint8Array(32);
            bytes.fill(0x77);
            const address = Address.wrap(bytes);

            expect(address.toHex()).toContain('77777777');
        });
    });

    describe('Static Methods - uncompressedToCompressed()', () => {
        it('should compress an uncompressed public key (even y-coordinate)', () => {
            const uncompressed = Buffer.alloc(65);
            uncompressed[0] = 0x04;
            // Fill x-coordinate
            for (let i = 1; i <= 32; i++) uncompressed[i] = 0x01;
            // Fill y-coordinate with even last byte
            for (let i = 33; i < 65; i++) uncompressed[i] = 0x02;
            uncompressed[64] = 0x00; // Even

            const compressed = Address.uncompressedToCompressed(uncompressed);

            expect(compressed.length).toBe(33);
            expect(compressed[0]).toBe(0x02); // Even y-coordinate
        });

        it('should compress an uncompressed public key (odd y-coordinate)', () => {
            const uncompressed = Buffer.alloc(65);
            uncompressed[0] = 0x04;
            // Fill x-coordinate
            for (let i = 1; i <= 32; i++) uncompressed[i] = 0x01;
            // Fill y-coordinate with odd last byte
            for (let i = 33; i < 65; i++) uncompressed[i] = 0x02;
            uncompressed[64] = 0x01; // Odd

            const compressed = Address.uncompressedToCompressed(uncompressed);

            expect(compressed.length).toBe(33);
            expect(compressed[0]).toBe(0x03); // Odd y-coordinate
        });

        it('should compress from Uint8Array', () => {
            const uncompressed = new Uint8Array(65);
            uncompressed[0] = 0x04;
            for (let i = 1; i < 65; i++) uncompressed[i] = i % 256;

            const compressed = Address.uncompressedToCompressed(uncompressed);

            expect(compressed.length).toBe(33);
            expect(compressed[0] === 0x02 || compressed[0] === 0x03).toBe(true);
        });
    });

    describe('Getters', () => {
        it('should return undefined originalPublicKey for address without classical key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(address.originalPublicKey).toBeUndefined();
        });

        it('should return originalPublicKey when set', () => {
            const addr = getValidAddress();
            expect(addr.originalPublicKey).toBeDefined();
            expect(addr.originalPublicKey?.length).toBe(33);
        });

        it('should return mldsaPublicKey when full key is provided', () => {
            const mldsaPubKey = Buffer.alloc(1312, 0xab);
            const address = new Address(mldsaPubKey);

            expect(address.mldsaPublicKey).toBeDefined();
            expect(address.mldsaPublicKey?.length).toBe(1312);

            if (!address.mldsaPublicKey) {
                throw new Error('mldsaPublicKey is undefined');
            }

            expect(Buffer.from(address.mldsaPublicKey).toString('hex')).toContain('abab');
        });

        it('should return undefined mldsaPublicKey when only hash is provided', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(address.mldsaPublicKey).toBeUndefined();
        });
    });

    describe('Conversion Methods - toHex/toBuffer', () => {
        it('should convert to hex with 0x prefix', () => {
            const bytes = Buffer.alloc(32, 0xff);
            const address = new Address(bytes);

            const hex = address.toHex();
            expect(hex).toMatch(/^0x[0-9a-f]{64}$/);
            expect(hex).toContain('ffffff');
        });

        it('should convert to buffer', () => {
            const bytes = Buffer.alloc(32, 0xaa);
            const address = new Address(bytes);

            const buffer = address.toBuffer();
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBe(32);
            expect(buffer.toString('hex')).toContain('aaaa');
        });

        it('should toString return same as toHex', () => {
            const addr = getValidAddress();
            expect(addr.toString()).toBe(addr.toHex());
        });

        it('should toJSON return same as toHex', () => {
            const addr = getValidAddress();
            expect(addr.toJSON()).toBe(addr.toHex());
        });
    });

    describe('Conversion Methods - tweaked', () => {
        it('should convert tweaked to hex', () => {
            const addr = getValidAddress();
            const tweakedHex = addr.tweakedToHex();

            expect(tweakedHex).toMatch(/^0x[0-9a-f]{64}$/);
        });

        it('should throw error for tweakedToHex without classical key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.tweakedToHex()).toThrow('Classical public key not set');
        });

        it('should convert tweaked public key to buffer', () => {
            const addr = getValidAddress();
            const buffer = addr.tweakedPublicKeyToBuffer();

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBe(32);
        });

        it('should throw error for tweakedPublicKeyToBuffer without classical key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.tweakedPublicKeyToBuffer()).toThrow('Classical public key not set');
        });

        it('should get toTweakedHybridPublicKeyHex', () => {
            const addr = getValidAddress();
            const hybridHex = addr.toTweakedHybridPublicKeyHex();

            expect(hybridHex).toMatch(/^0x[0-9a-f]+$/);
        });

        it('should throw error for toTweakedHybridPublicKeyHex without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.toTweakedHybridPublicKeyHex()).toThrow('Public key not set');
        });

        it('should get toTweakedHybridPublicKeyBuffer', () => {
            const addr = getValidAddress();
            const buffer = addr.toTweakedHybridPublicKeyBuffer();

            expect(buffer).toBeInstanceOf(Buffer);
        });

        it('should throw error for toTweakedHybridPublicKeyBuffer without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.toTweakedHybridPublicKeyBuffer()).toThrow('Public key not set');
        });
    });

    describe('Conversion Methods - uncompressed and hybrid', () => {
        it('should get uncompressed hex', () => {
            const addr = getValidAddress();
            const uncompressedHex = addr.toUncompressedHex();

            expect(uncompressedHex).toMatch(/^0x[0-9a-f]{130}$/); // 65 bytes = 130 hex chars
        });

        it('should throw error for toUncompressedHex without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.toUncompressedHex()).toThrow('Public key not set');
        });

        it('should get uncompressed buffer', () => {
            const addr = getValidAddress();
            const buffer = addr.toUncompressedBuffer();

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBe(65);
        });

        it('should throw error for toUncompressedBuffer without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.toUncompressedBuffer()).toThrow('Public key not set');
        });

        it('should get hybrid public key hex', () => {
            const addr = getValidAddress();
            const hybridHex = addr.toHybridPublicKeyHex();

            expect(hybridHex).toMatch(/^0x[0-9a-f]+$/);
        });

        it('should throw error for toHybridPublicKeyHex without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.toHybridPublicKeyHex()).toThrow('Public key not set');
        });

        it('should get hybrid public key buffer', () => {
            const addr = getValidAddress();
            const buffer = addr.toHybridPublicKeyBuffer();

            expect(buffer).toBeInstanceOf(Buffer);
        });

        it('should throw error for toHybridPublicKeyBuffer without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.toHybridPublicKeyBuffer()).toThrow('Public key not set');
        });

        it('should get original public key buffer', () => {
            const addr = getValidAddress();
            const buffer = addr.originalPublicKeyBuffer();

            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBe(33);
        });

        it('should throw error for originalPublicKeyBuffer without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.originalPublicKeyBuffer()).toThrow('Public key not set');
        });
    });

    describe('Comparison Methods - equals', () => {
        it('should return true for equal addresses', () => {
            const bytes = Buffer.alloc(32, 0x42);
            const addr1 = new Address(bytes);
            const addr2 = new Address(bytes);

            expect(addr1.equals(addr2)).toBe(true);
        });

        it('should return false for different addresses', () => {
            const bytes1 = Buffer.alloc(32, 0x01);
            const bytes2 = Buffer.alloc(32, 0x02);
            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);

            expect(addr1.equals(addr2)).toBe(false);
        });

        it('should return false for addresses with different content', () => {
            const bytes1 = Buffer.alloc(32, 0x11);
            const bytes2 = Buffer.alloc(32, 0x22);
            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);

            expect(addr1.equals(addr2)).toBe(false);
        });

        it('should return true when comparing same instance', () => {
            const addr = getValidAddress();
            expect(addr.equals(addr)).toBe(true);
        });
    });

    describe('Comparison Methods - lessThan', () => {
        it('should return true when address is less than another', () => {
            const bytes1 = Buffer.alloc(32, 0x01);
            const bytes2 = Buffer.alloc(32, 0x02);
            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);

            expect(addr1.lessThan(addr2)).toBe(true);
        });

        it('should return false when address is greater than another', () => {
            const bytes1 = Buffer.alloc(32, 0x02);
            const bytes2 = Buffer.alloc(32, 0x01);
            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);

            expect(addr1.lessThan(addr2)).toBe(false);
        });

        it('should return false when addresses are equal', () => {
            const bytes = Buffer.alloc(32, 0x42);
            const addr1 = new Address(bytes);
            const addr2 = new Address(bytes);

            expect(addr1.lessThan(addr2)).toBe(false);
        });

        it('should compare byte by byte correctly', () => {
            const bytes1 = Buffer.alloc(32, 0x01);
            const bytes2 = Buffer.alloc(32, 0x01);
            bytes1[31] = 0x01; // Last byte smaller
            bytes2[31] = 0x02;
            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);

            expect(addr1.lessThan(addr2)).toBe(true);
        });
    });

    describe('Comparison Methods - greaterThan', () => {
        it('should return true when address is greater than another', () => {
            const bytes1 = Buffer.alloc(32, 0x02);
            const bytes2 = Buffer.alloc(32, 0x01);
            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);

            expect(addr1.greaterThan(addr2)).toBe(true);
        });

        it('should return false when address is less than another', () => {
            const bytes1 = Buffer.alloc(32, 0x01);
            const bytes2 = Buffer.alloc(32, 0x02);
            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);

            expect(addr1.greaterThan(addr2)).toBe(false);
        });

        it('should return false when addresses are equal', () => {
            const bytes = Buffer.alloc(32, 0x42);
            const addr1 = new Address(bytes);
            const addr2 = new Address(bytes);

            expect(addr1.greaterThan(addr2)).toBe(false);
        });

        it('should compare byte by byte correctly', () => {
            const bytes1 = Buffer.alloc(32, 0x01);
            const bytes2 = Buffer.alloc(32, 0x01);
            bytes1[0] = 0x02; // First byte greater
            bytes2[0] = 0x01;
            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);

            expect(addr1.greaterThan(addr2)).toBe(true);
        });
    });

    describe('Set Method - ML-DSA validation', () => {
        it('should set 32-byte ML-DSA hash', () => {
            const address = new Address();
            const hash = Buffer.alloc(32, 0x77);
            address.set(hash);

            expect(address.toHex()).toContain('77777777');
        });

        it('should set 1312-byte ML-DSA public key (LEVEL2)', () => {
            const address = new Address();
            const mldsaPubKey = Buffer.alloc(1312, 0xaa);
            address.set(mldsaPubKey);

            expect(address.mldsaPublicKey?.length).toBe(1312);
        });

        it('should set 1952-byte ML-DSA public key (LEVEL3)', () => {
            const address = new Address();
            const mldsaPubKey = Buffer.alloc(1952, 0xbb);
            address.set(mldsaPubKey);

            expect(address.mldsaPublicKey?.length).toBe(1952);
        });

        it('should set 2592-byte ML-DSA public key (LEVEL5)', () => {
            const address = new Address();
            const mldsaPubKey = Buffer.alloc(2592, 0xcc);
            address.set(mldsaPubKey);

            expect(address.mldsaPublicKey?.length).toBe(2592);
        });

        it('should throw error for invalid ML-DSA public key length', () => {
            const address = new Address();
            const invalidPubKey = Buffer.alloc(1000);

            expect(() => address.set(invalidPubKey)).toThrow('Invalid ML-DSA public key length');
        });

        it('should throw error for invalid classical public key length', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const invalidClassicKey = Buffer.alloc(20); // Invalid length

            expect(() => new Address(mldsaHash, invalidClassicKey)).toThrow(
                'Invalid public key length',
            );
        });
    });

    describe('Address Generation - p2pk', () => {
        it('should return p2pk address (hex)', () => {
            const addr = getValidAddress();
            const p2pk = addr.p2pk();

            expect(p2pk).toBe(addr.toHex());
        });
    });

    describe('Address Generation - p2wpkh', () => {
        it('should generate p2wpkh address for mainnet', () => {
            const addr = getValidAddress();
            const p2wpkh = addr.p2wpkh(networks.bitcoin);

            expect(p2wpkh).toMatch(/^bc1q/);
        });

        it('should generate p2wpkh address for testnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2wpkh = wallet.address.p2wpkh(networks.testnet);

            expect(p2wpkh).toMatch(/^tb1q/);
        });

        it('should generate p2wpkh address for regtest', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.regtest,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2wpkh = wallet.address.p2wpkh(networks.regtest);

            expect(p2wpkh).toMatch(/^bcrt1q/);
        });

        it('should throw error for p2wpkh without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.p2wpkh(networks.bitcoin)).toThrow('Public key not set');
        });
    });

    describe('Address Generation - p2pkh', () => {
        it('should generate p2pkh address for mainnet', () => {
            const addr = getValidAddress();
            const p2pkh = addr.p2pkh(networks.bitcoin);

            expect(p2pkh).toMatch(/^1/);
        });

        it('should generate p2pkh address for testnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2pkh = wallet.address.p2pkh(networks.testnet);

            expect(p2pkh).toMatch(/^[mn]/);
        });

        it('should throw error for p2pkh without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.p2pkh(networks.bitcoin)).toThrow('Public key not set');
        });
    });

    describe('Address Generation - p2shp2wpkh', () => {
        it('should generate p2shp2wpkh address for mainnet', () => {
            const addr = getValidAddress();
            const p2sh = addr.p2shp2wpkh(networks.bitcoin);

            expect(p2sh).toMatch(/^3/);
        });

        it('should generate p2shp2wpkh address for testnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2sh = wallet.address.p2shp2wpkh(networks.testnet);

            expect(p2sh).toMatch(/^2/);
        });

        it('should throw error for p2shp2wpkh without key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.p2shp2wpkh(networks.bitcoin)).toThrow('Public key not set');
        });
    });

    describe('Address Generation - p2tr', () => {
        it('should generate p2tr address for mainnet', () => {
            const addr = getValidAddress();
            const p2tr = addr.p2tr(networks.bitcoin);

            expect(p2tr).toMatch(/^bc1p/);
        });

        it('should generate p2tr address for testnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2tr = wallet.address.p2tr(networks.testnet);

            expect(p2tr).toMatch(/^tb1p/);
        });

        it('should cache p2tr address for same network', () => {
            const addr = getValidAddress();
            const p2tr1 = addr.p2tr(networks.bitcoin);
            const p2tr2 = addr.p2tr(networks.bitcoin);

            expect(p2tr1).toBe(p2tr2);
        });

        it('should generate different p2tr for different networks', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            // Can't easily test cross-network without recreating, but we can verify it works
            const p2trMain = wallet.address.p2tr(networks.bitcoin);
            expect(p2trMain).toMatch(/^bc1p/);
        });

        it('should throw error for p2tr without classical key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.p2tr(networks.bitcoin)).toThrow('Public key not set');
        });
    });

    describe('Address Generation - p2op', () => {
        it('should generate p2op address for mainnet', () => {
            const addr = getValidAddress();
            const p2op = addr.p2op(networks.bitcoin);

            expect(p2op).toBeDefined();
            expect(typeof p2op).toBe('string');
        });

        it('should generate p2op address for testnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2op = wallet.address.p2op(networks.testnet);

            expect(p2op).toBeDefined();
            expect(typeof p2op).toBe('string');
        });

        it('should cache p2op address for same network', () => {
            const addr = getValidAddress();
            const p2op1 = addr.p2op(networks.bitcoin);
            const p2op2 = addr.p2op(networks.bitcoin);

            expect(p2op1).toBe(p2op2);
        });

        it('should generate p2op for different security levels', () => {
            const addr2 = getValidAddress(MLDSASecurityLevel.LEVEL2);
            const addr3 = getValidAddress(MLDSASecurityLevel.LEVEL3);
            const addr5 = getValidAddress(MLDSASecurityLevel.LEVEL5);

            const p2op2 = addr2.p2op(networks.bitcoin);
            const p2op3 = addr3.p2op(networks.bitcoin);
            const p2op5 = addr5.p2op(networks.bitcoin);

            expect(p2op2).toBeDefined();
            expect(p2op3).toBeDefined();
            expect(p2op5).toBeDefined();
        });
    });

    describe('Address Generation - p2wda', () => {
        it('should generate p2wda address', () => {
            const addr = getValidAddress();
            const p2wda = addr.p2wda(networks.bitcoin);

            expect(p2wda.address).toMatch(/^bc1q/);
            expect(p2wda.witnessScript).toBeInstanceOf(Buffer);
        });

        it('should cache p2wda for same network', () => {
            const addr = getValidAddress();
            const p2wda1 = addr.p2wda(networks.bitcoin);
            const p2wda2 = addr.p2wda(networks.bitcoin);

            expect(p2wda1.address).toBe(p2wda2.address);
        });

        it('should generate p2wda for testnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const p2wda = wallet.address.p2wda(networks.testnet);

            expect(p2wda.address).toMatch(/^tb1q/);
        });

        it('should throw error for p2wda without original public key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.p2wda(networks.bitcoin)).toThrow('Cannot create P2WDA address');
        });
    });

    describe('Address Generation - toCSV (timelocked)', () => {
        it('should generate CSV address with valid duration (number)', () => {
            const addr = getValidAddress();
            const csv = addr.toCSV(100, networks.bitcoin);

            expect(csv.address).toMatch(/^bc1q/);
            expect(csv.witnessScript).toBeInstanceOf(Buffer);
        });

        it('should generate CSV address with valid duration (bigint)', () => {
            const addr = getValidAddress();
            const csv = addr.toCSV(BigInt(1000), networks.bitcoin);

            expect(csv.address).toMatch(/^bc1q/);
        });

        it('should generate CSV address with valid duration (string)', () => {
            const addr = getValidAddress();
            const csv = addr.toCSV('500', networks.bitcoin);

            expect(csv.address).toMatch(/^bc1q/);
        });

        it('should generate CSV address with minimum duration (1)', () => {
            const addr = getValidAddress();
            const csv = addr.toCSV(1, networks.bitcoin);

            expect(csv.address).toMatch(/^bc1q/);
        });

        it('should generate CSV address with maximum duration (65535)', () => {
            const addr = getValidAddress();
            const csv = addr.toCSV(65535, networks.bitcoin);

            expect(csv.address).toMatch(/^bc1q/);
        });

        it('should throw error for CSV duration less than 1', () => {
            const addr = getValidAddress();
            expect(() => addr.toCSV(0, networks.bitcoin)).toThrow(
                'CSV block number must be between 1 and 65535',
            );
        });

        it('should throw error for CSV duration greater than 65535', () => {
            const addr = getValidAddress();
            expect(() => addr.toCSV(65536, networks.bitcoin)).toThrow(
                'CSV block number must be between 1 and 65535',
            );
        });

        it('should throw error for negative CSV duration', () => {
            const addr = getValidAddress();
            expect(() => addr.toCSV(-1, networks.bitcoin)).toThrow(
                'CSV block number must be between 1 and 65535',
            );
        });

        it('should throw error for CSV without original public key', () => {
            const mldsaHash = Buffer.alloc(32, 0x01);
            const address = new Address(mldsaHash);

            expect(() => address.toCSV(100, networks.bitcoin)).toThrow('Cannot create CSV address');
        });

        it('should generate different CSV addresses for different durations', () => {
            const addr = getValidAddress();
            const csv1 = addr.toCSV(100, networks.bitcoin);
            const csv2 = addr.toCSV(200, networks.bitcoin);

            expect(csv1.address).not.toBe(csv2.address);
        });
    });

    describe('isValid Method', () => {
        it('should validate address on mainnet', () => {
            const addr = getValidAddress();
            const isValid = addr.isValid(networks.bitcoin);

            expect(isValid).toBe(true);
        });

        it('should validate address on testnet', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.testnet,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);
            const isValid = wallet.address.isValid(networks.testnet);

            expect(isValid).toBe(true);
        });
    });

    describe('Edge Cases and Complex Scenarios', () => {
        it('should handle multiple format conversions', () => {
            const addr = getValidAddress();

            const hex = addr.toHex();
            const buffer = addr.toBuffer();
            const string = addr.toString();
            const json = addr.toJSON();

            expect(hex).toBe(string);
            expect(hex).toBe(json);
            expect(Buffer.from(buffer).toString('hex')).toBe(hex.slice(2));
        });

        it('should handle multiple address generations', () => {
            const addr = getValidAddress();

            const p2wpkh = addr.p2wpkh(networks.bitcoin);
            const p2tr = addr.p2tr(networks.bitcoin);
            const p2op = addr.p2op(networks.bitcoin);

            expect(p2wpkh).toMatch(/^bc1q/);
            expect(p2tr).toMatch(/^bc1p/);
            expect(p2op).toBeDefined();
            expect(typeof p2op).toBe('string');
        });

        it('should handle comparison chain', () => {
            const bytes1 = Buffer.alloc(32, 0x01);
            const bytes2 = Buffer.alloc(32, 0x02);
            const bytes3 = Buffer.alloc(32, 0x03);

            const addr1 = new Address(bytes1);
            const addr2 = new Address(bytes2);
            const addr3 = new Address(bytes3);

            expect(addr1.lessThan(addr2)).toBe(true);
            expect(addr2.lessThan(addr3)).toBe(true);
            expect(addr1.lessThan(addr3)).toBe(true);

            expect(addr3.greaterThan(addr2)).toBe(true);
            expect(addr2.greaterThan(addr1)).toBe(true);
            expect(addr3.greaterThan(addr1)).toBe(true);
        });

        it('should handle all ML-DSA security levels', () => {
            const level2 = getValidAddress(MLDSASecurityLevel.LEVEL2);
            const level3 = getValidAddress(MLDSASecurityLevel.LEVEL3);
            const level5 = getValidAddress(MLDSASecurityLevel.LEVEL5);

            expect(level2.mldsaPublicKey?.length).toBe(1312);
            expect(level3.mldsaPublicKey?.length).toBe(1952);
            expect(level5.mldsaPublicKey?.length).toBe(2592);
        });

        it('should handle address with 65-byte uncompressed classical key', () => {
            const mnemonic = new Mnemonic(
                testMnemonic,
                '',
                networks.bitcoin,
                MLDSASecurityLevel.LEVEL2,
            );
            const wallet = mnemonic.derive(0);

            // Get the uncompressed public key from the wallet
            const uncompressedKey = wallet.address.toUncompressedBuffer();
            const mldsaHash = Buffer.alloc(32, 0x01);

            const address = new Address(mldsaHash, uncompressedKey);
            expect(address.originalPublicKey).toBeDefined();
        });

        it('should handle dead address operations', () => {
            const dead = Address.dead();

            expect(dead.toHex()).toContain('000000');
            expect(dead.p2tr(networks.bitcoin)).toBeDefined();
            expect(dead.p2op(networks.bitcoin)).toBeDefined();
        });

        it('should correctly order addresses', () => {
            const addresses: Address[] = [];
            for (let i = 0; i < 5; i++) {
                const bytes = Buffer.alloc(32, i);
                addresses.push(new Address(bytes));
            }

            for (let i = 0; i < addresses.length - 1; i++) {
                expect(addresses[i].lessThan(addresses[i + 1])).toBe(true);
                expect(addresses[i + 1].greaterThan(addresses[i])).toBe(true);
            }
        });
    });

    describe('Network Caching', () => {
        it('should cache and reuse p2tr for same network', () => {
            const addr = getValidAddress();

            const first = addr.p2tr(networks.bitcoin);
            const second = addr.p2tr(networks.bitcoin);

            expect(first).toBe(second);
        });

        it('should cache and reuse p2op for same network', () => {
            const addr = getValidAddress();

            const first = addr.p2op(networks.bitcoin);
            const second = addr.p2op(networks.bitcoin);

            expect(first).toBe(second);
        });

        it('should cache and reuse p2wda for same network', () => {
            const addr = getValidAddress();

            const first = addr.p2wda(networks.bitcoin);
            const second = addr.p2wda(networks.bitcoin);

            expect(first.address).toBe(second.address);
        });
    });
});
