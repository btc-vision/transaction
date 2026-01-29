import { describe, expect, it } from 'vitest';
import { Address, BinaryReader, BinaryWriter, ExtendedAddressMap } from '../src/opnet.js';

describe('BinaryReader/BinaryWriter', () => {
    // Helper to create an Address with both MLDSA and tweaked keys
    const createFullAddress = (mldsaValue: bigint, tweakedValue: bigint): Address => {
        return Address.fromBigInt(mldsaValue, tweakedValue);
    };

    describe('Signed Integer Methods', () => {
        describe('i8', () => {
            it('should write and read positive i8', () => {
                const writer = new BinaryWriter();
                writer.writeI8(127);
                writer.writeI8(0);
                writer.writeI8(1);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI8()).toBe(127);
                expect(reader.readI8()).toBe(0);
                expect(reader.readI8()).toBe(1);
            });

            it('should write and read negative i8', () => {
                const writer = new BinaryWriter();
                writer.writeI8(-128);
                writer.writeI8(-1);
                writer.writeI8(-50);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI8()).toBe(-128);
                expect(reader.readI8()).toBe(-1);
                expect(reader.readI8()).toBe(-50);
            });

            it('should throw on out of range i8', () => {
                const writer = new BinaryWriter();
                expect(() => writer.writeI8(128)).toThrow();
                expect(() => writer.writeI8(-129)).toThrow();
            });
        });

        describe('i16', () => {
            it('should write and read positive i16 big-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI16(32767);
                writer.writeI16(256);
                writer.writeI16(0);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI16()).toBe(32767);
                expect(reader.readI16()).toBe(256);
                expect(reader.readI16()).toBe(0);
            });

            it('should write and read negative i16 big-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI16(-32768);
                writer.writeI16(-1);
                writer.writeI16(-256);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI16()).toBe(-32768);
                expect(reader.readI16()).toBe(-1);
                expect(reader.readI16()).toBe(-256);
            });

            it('should write and read i16 little-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI16(12345, false);
                writer.writeI16(-12345, false);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI16(false)).toBe(12345);
                expect(reader.readI16(false)).toBe(-12345);
            });

            it('should throw on out of range i16', () => {
                const writer = new BinaryWriter();
                expect(() => writer.writeI16(32768)).toThrow();
                expect(() => writer.writeI16(-32769)).toThrow();
            });
        });

        describe('i32', () => {
            it('should write and read positive i32 big-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI32(2147483647);
                writer.writeI32(65536);
                writer.writeI32(0);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI32()).toBe(2147483647);
                expect(reader.readI32()).toBe(65536);
                expect(reader.readI32()).toBe(0);
            });

            it('should write and read negative i32 big-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI32(-2147483648);
                writer.writeI32(-1);
                writer.writeI32(-65536);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI32()).toBe(-2147483648);
                expect(reader.readI32()).toBe(-1);
                expect(reader.readI32()).toBe(-65536);
            });

            it('should write and read i32 little-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI32(123456789, false);
                writer.writeI32(-123456789, false);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI32(false)).toBe(123456789);
                expect(reader.readI32(false)).toBe(-123456789);
            });

            it('should throw on out of range i32', () => {
                const writer = new BinaryWriter();
                expect(() => writer.writeI32(2147483648)).toThrow();
                expect(() => writer.writeI32(-2147483649)).toThrow();
            });
        });

        describe('i64', () => {
            it('should write and read positive i64 big-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI64(9223372036854775807n);
                writer.writeI64(4294967296n);
                writer.writeI64(0n);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI64()).toBe(9223372036854775807n);
                expect(reader.readI64()).toBe(4294967296n);
                expect(reader.readI64()).toBe(0n);
            });

            it('should write and read negative i64 big-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI64(-9223372036854775808n);
                writer.writeI64(-1n);
                writer.writeI64(-4294967296n);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI64()).toBe(-9223372036854775808n);
                expect(reader.readI64()).toBe(-1n);
                expect(reader.readI64()).toBe(-4294967296n);
            });

            it('should write and read i64 little-endian', () => {
                const writer = new BinaryWriter();
                writer.writeI64(1234567890123456789n, false);
                writer.writeI64(-1234567890123456789n, false);

                const reader = new BinaryReader(writer.getBuffer());
                expect(reader.readI64(false)).toBe(1234567890123456789n);
                expect(reader.readI64(false)).toBe(-1234567890123456789n);
            });

            it('should throw on out of range i64', () => {
                const writer = new BinaryWriter();
                expect(() => writer.writeI64(9223372036854775808n)).toThrow();
                expect(() => writer.writeI64(-9223372036854775809n)).toThrow();
            });
        });
    });

    describe('Extended Address Methods', () => {
        describe('readExtendedAddress / writeExtendedAddress', () => {
            it('should write and read extended address', () => {
                const writer = new BinaryWriter();
                const address = createFullAddress(123n, 456n);

                writer.writeExtendedAddress(address);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddress();

                expect(result.toBigInt()).toBe(123n);
                expect(result.tweakedToBigInt()).toBe(456n);
            });

            it('should write and read multiple extended addresses', () => {
                const writer = new BinaryWriter();
                const addr1 = createFullAddress(100n, 200n);
                const addr2 = createFullAddress(300n, 400n);
                const addr3 = createFullAddress(500n, 600n);

                writer.writeExtendedAddress(addr1);
                writer.writeExtendedAddress(addr2);
                writer.writeExtendedAddress(addr3);

                const reader = new BinaryReader(writer.getBuffer());

                const result1 = reader.readExtendedAddress();
                expect(result1.toBigInt()).toBe(100n);
                expect(result1.tweakedToBigInt()).toBe(200n);

                const result2 = reader.readExtendedAddress();
                expect(result2.toBigInt()).toBe(300n);
                expect(result2.tweakedToBigInt()).toBe(400n);

                const result3 = reader.readExtendedAddress();
                expect(result3.toBigInt()).toBe(500n);
                expect(result3.tweakedToBigInt()).toBe(600n);
            });

            it('should handle zero addresses', () => {
                const writer = new BinaryWriter();
                const address = createFullAddress(0n, 0n);

                writer.writeExtendedAddress(address);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddress();

                expect(result.toBigInt()).toBe(0n);
                expect(result.tweakedToBigInt()).toBe(0n);
            });

            it('should handle max value addresses', () => {
                const writer = new BinaryWriter();
                const maxValue = 2n ** 256n - 1n;
                const address = createFullAddress(maxValue, maxValue);

                writer.writeExtendedAddress(address);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddress();

                expect(result.toBigInt()).toBe(maxValue);
                expect(result.tweakedToBigInt()).toBe(maxValue);
            });
        });

        describe('readExtendedAddressArray / writeExtendedAddressArray', () => {
            it('should write and read empty array', () => {
                const writer = new BinaryWriter();
                writer.writeExtendedAddressArray([]);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddressArray();

                expect(result).toEqual([]);
            });

            it('should write and read array of extended addresses', () => {
                const writer = new BinaryWriter();
                const addresses = [
                    createFullAddress(1n, 2n),
                    createFullAddress(3n, 4n),
                    createFullAddress(5n, 6n),
                ];

                writer.writeExtendedAddressArray(addresses);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddressArray();

                expect(result.length).toBe(3);
                expect((result[0] as Address).toBigInt()).toBe(1n);
                expect((result[0] as Address).tweakedToBigInt()).toBe(2n);
                expect((result[1] as Address).toBigInt()).toBe(3n);
                expect((result[1] as Address).tweakedToBigInt()).toBe(4n);
                expect((result[2] as Address).toBigInt()).toBe(5n);
                expect((result[2] as Address).tweakedToBigInt()).toBe(6n);
            });

            it('should handle large arrays', () => {
                const writer = new BinaryWriter();
                const addresses: Address[] = [];
                for (let i = 0; i < 100; i++) {
                    addresses.push(createFullAddress(BigInt(i), BigInt(i * 2)));
                }

                writer.writeExtendedAddressArray(addresses);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddressArray();

                expect(result.length).toBe(100);
                for (let i = 0; i < 100; i++) {
                    expect((result[i] as Address).toBigInt()).toBe(BigInt(i));
                    expect((result[i] as Address).tweakedToBigInt()).toBe(BigInt(i * 2));
                }
            });
        });
    });

    describe('ExtendedAddressMapU256 Methods', () => {
        describe('readExtendedAddressMapU256 / writeExtendedAddressMapU256', () => {
            it('should write and read empty map', () => {
                const writer = new BinaryWriter();
                const map = new ExtendedAddressMap<bigint>();

                writer.writeExtendedAddressMapU256(map);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddressMapU256();

                expect(result.size).toBe(0);
            });

            it('should write and read map with entries', () => {
                const writer = new BinaryWriter();
                const map = new ExtendedAddressMap<bigint>();

                const addr1 = createFullAddress(100n, 200n);
                const addr2 = createFullAddress(300n, 400n);

                map.set(addr1, 1000n);
                map.set(addr2, 2000n);

                writer.writeExtendedAddressMapU256(map);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddressMapU256();

                expect(result.size).toBe(2);
            });

            it('should handle large u256 values', () => {
                const writer = new BinaryWriter();
                const map = new ExtendedAddressMap<bigint>();

                const addr = createFullAddress(1n, 2n);
                const largeValue = 2n ** 256n - 1n;

                map.set(addr, largeValue);

                writer.writeExtendedAddressMapU256(map);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readExtendedAddressMapU256();

                expect(result.size).toBe(1);
            });
        });
    });

    describe('Schnorr Signature Methods', () => {
        describe('readSchnorrSignature / writeSchnorrSignature', () => {
            it('should write and read Schnorr signature', () => {
                const writer = new BinaryWriter();
                const address = createFullAddress(12345n, 67890n);
                const signature = new Uint8Array(64);
                for (let i = 0; i < 64; i++) {
                    signature[i] = i;
                }

                writer.writeSchnorrSignature(address, signature);

                const reader = new BinaryReader(writer.getBuffer());
                const result = reader.readSchnorrSignature();

                expect(result.address.toBigInt()).toBe(12345n);
                expect(result.address.tweakedToBigInt()).toBe(67890n);
                expect(result.signature.length).toBe(64);
                for (let i = 0; i < 64; i++) {
                    expect(result.signature[i]).toBe(i);
                }
            });

            it('should throw on invalid signature length', () => {
                const writer = new BinaryWriter();
                const address = createFullAddress(1n, 2n);
                const invalidSignature = new Uint8Array(32); // Should be 64

                expect(() => writer.writeSchnorrSignature(address, invalidSignature)).toThrow();
            });

            it('should handle multiple signatures', () => {
                const writer = new BinaryWriter();

                const sig1 = new Uint8Array(64).fill(1);
                const sig2 = new Uint8Array(64).fill(2);

                writer.writeSchnorrSignature(createFullAddress(1n, 2n), sig1);
                writer.writeSchnorrSignature(createFullAddress(3n, 4n), sig2);

                const reader = new BinaryReader(writer.getBuffer());

                const result1 = reader.readSchnorrSignature();
                expect(result1.address.toBigInt()).toBe(1n);
                expect(result1.signature[0]).toBe(1);

                const result2 = reader.readSchnorrSignature();
                expect(result2.address.toBigInt()).toBe(3n);
                expect(result2.signature[0]).toBe(2);
            });
        });
    });

    describe('Mixed Operations', () => {
        it('should handle mixed data types in sequence', () => {
            const writer = new BinaryWriter();

            // Write various types
            writer.writeI8(-50);
            writer.writeI16(-1000);
            writer.writeI32(-100000);
            writer.writeI64(-10000000000n);
            writer.writeExtendedAddress(createFullAddress(111n, 222n));
            writer.writeU256(999n);

            const reader = new BinaryReader(writer.getBuffer());

            expect(reader.readI8()).toBe(-50);
            expect(reader.readI16()).toBe(-1000);
            expect(reader.readI32()).toBe(-100000);
            expect(reader.readI64()).toBe(-10000000000n);

            const addr = reader.readExtendedAddress();
            expect(addr.toBigInt()).toBe(111n);
            expect(addr.tweakedToBigInt()).toBe(222n);

            expect(reader.readU256()).toBe(999n);
        });

        it('should correctly track buffer position', () => {
            const writer = new BinaryWriter();

            writer.writeI8(1);
            writer.writeI16(2);
            writer.writeI32(3);
            writer.writeI64(4n);
            writer.writeExtendedAddress(createFullAddress(5n, 6n));

            const buffer = writer.getBuffer();
            // i8: 1 byte, i16: 2 bytes, i32: 4 bytes, i64: 8 bytes, extended address: 64 bytes
            expect(buffer.length).toBe(1 + 2 + 4 + 8 + 64);
        });
    });

    describe('Error Handling', () => {
        it('should throw when reading beyond buffer', () => {
            const writer = new BinaryWriter();
            writer.writeI8(1);

            const reader = new BinaryReader(writer.getBuffer());
            reader.readI8();

            expect(() => reader.readI8()).toThrow();
        });

        it('should throw when reading extended address from insufficient buffer', () => {
            const writer = new BinaryWriter();
            writer.writeU256(1n); // Only 32 bytes

            const reader = new BinaryReader(writer.getBuffer());

            expect(() => reader.readExtendedAddress()).toThrow();
        });
    });
});
