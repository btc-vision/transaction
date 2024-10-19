import { DeterministicMap } from '../deterministic/DeterministicMap.js';

export const ADDRESS_BYTE_LENGTH: number = 32;

export type MemorySlotPointer = bigint;

export type BufferLike = Uint8Array | Buffer;

export type MemorySlotData<T> = T;
export type PointerStorage = DeterministicMap<MemorySlotPointer, MemorySlotData<bigint>>;

export type i32 = number;
export type u8 = number;
export type u16 = number;
export type u32 = number;

export type u64 = bigint;

export type Selector = number;
