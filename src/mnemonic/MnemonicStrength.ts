export enum MnemonicStrength {
    /** 128 bits of entropy - 12 words */
    MINIMUM = 128,
    /** 160 bits of entropy - 15 words */
    LOW = 160,
    /** 192 bits of entropy - 18 words */
    MEDIUM = 192,
    /** 224 bits of entropy - 21 words */
    HIGH = 224,
    /** 256 bits of entropy - 24 words */
    MAXIMUM = 256,
}
