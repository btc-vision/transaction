import {
    PsbtInput as _PsbtInput,
    PsbtInputUpdate as _PsbtInputUpdate,
    PsbtOutput as _PsbtOutput,
    TapBip32Derivation as _TapBip32Derivation,
    TapInternalKey as _TapInternalKey,
    TapKeySig as _TapKeySig,
    TapLeaf as _TapLeaf,
    TapLeafScript as _TapLeafScript,
    TapMerkleRoot as _TapMerkleRoot,
    TapScriptSig as _TapScriptSig,
    TapTree as _TapTree,
} from '@btc-vision/bitcoin';

export interface TapLeafScript {
    readonly leafVersion: number;
    readonly controlBlock: Buffer;
    readonly script: Buffer;
}

export interface UpdateInput {
    tapLeafScript: TapLeafScript[];
}

export interface PsbtInput extends _PsbtInput {}

export interface PsbtOutput extends _PsbtOutput {}

export interface TapInternalKey extends _TapInternalKey {}

export interface TapLeaf extends _TapLeaf {}

export interface TapScriptSig extends _TapScriptSig {}

export interface TapKeySig extends _TapKeySig {}

export interface TapTree extends _TapTree {}

export interface TapMerkleRoot extends _TapMerkleRoot {}

export interface TapLeafScript extends _TapLeafScript {}

export interface TapBip32Derivation extends _TapBip32Derivation {}

export interface PsbtInputUpdate extends _PsbtInputUpdate {}
