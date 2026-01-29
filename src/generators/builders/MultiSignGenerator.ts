import { alloc, compare, equals, opcodes, PublicKey, script, toXOnly, XOnlyPublicKey, } from '@btc-vision/bitcoin';

/**
 * Generate a bitcoin script for a multisign interaction
 */
export class MultiSignGenerator {
    public static readonly MAXIMUM_SUPPORTED_SIGNATURE = 255;

    public static compile(
        vaultPublicKeys: Uint8Array[] | PublicKey[],
        minimumSignatures: number = 0,
        internal?: Uint8Array | XOnlyPublicKey,
    ): Uint8Array {
        if (minimumSignatures < 2) {
            throw new Error('Minimum signatures must be greater than 1');
        }

        if (vaultPublicKeys.length < minimumSignatures) {
            throw new Error('The amount of public keys is lower than the minimum required');
        }

        if (minimumSignatures > MultiSignGenerator.MAXIMUM_SUPPORTED_SIGNATURE) {
            throw new Error(
                `The maximum amount of signatures is ${MultiSignGenerator.MAXIMUM_SUPPORTED_SIGNATURE}`,
            );
        }

        const minimumRequired = alloc(1);
        minimumRequired[0] = minimumSignatures;

        /** Remove duplicates **/
        vaultPublicKeys = vaultPublicKeys.filter(
            (buf, index, self) => index === self.findIndex((otherBuf) => equals(buf, otherBuf)),
        );

        /** We must order the pub keys. */
        vaultPublicKeys = vaultPublicKeys.sort((a, b) => compare(a, b));

        let included = false;
        const data = vaultPublicKeys.map((key) => {
            const newKey = toXOnly(key as PublicKey);
            if (internal && !included) included = equals(internal, newKey);

            return newKey;
        });

        if (internal && !included) data.push(internal as XOnlyPublicKey);
        const compiledData: (number | Uint8Array)[] = [
            // Push the initial 0 (for OP_CHECKSIGADD)
            opcodes.OP_0,

            // For each public key, add CHECKSIGADD operation
            ...data.flatMap((key) => [
                key, // Push the public key
                opcodes.OP_CHECKSIGADD, // Add the public key to the signature set
            ]),

            // Finally, compare the sum with the minimum required signatures
            minimumRequired,
            opcodes.OP_NUMEQUAL, // Use NUMEQUALVERIFY to ensure the correct number of signatures
        ];

        const asm = compiledData.flat();
        const compiled = script.compile(asm);

        /** Verify the validity of the script */
        const decompiled = script.decompile(compiled);
        if (!decompiled) {
            throw new Error('Failed to decompile script.');
        }

        return compiled;
    }
}
