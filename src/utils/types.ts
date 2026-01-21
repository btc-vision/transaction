import { DeterministicMap } from '../deterministic/DeterministicMap.js';

export type MemorySlotPointer = bigint;

export type BufferLike = Uint8Array | Buffer;

export type MemorySlotData<T> = T;
export type PointerStorage = DeterministicMap<MemorySlotPointer, MemorySlotData<bigint>>;
export type BlockchainStorage = DeterministicMap<string, PointerStorage>;

export type i8 = number;
export type i16 = number;
export type i32 = number;
export type i64 = bigint;

export type u8 = number;
export type u16 = number;
export type u32 = number;
export type u64 = bigint;

export type Selector = number;
