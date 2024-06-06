import { PsbtInput, PsbtOutput } from 'bip174/src/lib/interfaces.js';
import { TransactionInput } from 'bitcoinjs-lib/src/psbt.js';

export interface TapLeafScript {
    readonly leafVersion: number;
    readonly controlBlock: Buffer;
    readonly script: Buffer;
}

export interface UpdateInput {
    tapLeafScript: TapLeafScript[];
}

export interface PsbtInputExtended extends PsbtInput, TransactionInput {}

export interface PsbtOutputExtendedAddress extends PsbtOutput {
    address: string;
    value: number;
}

export interface PsbtOutputExtendedScript extends PsbtOutput {
    script: Buffer;
    value: number;
}

export type PsbtOutputExtended = PsbtOutputExtendedAddress | PsbtOutputExtendedScript;
