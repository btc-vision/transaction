import { opcodes, script } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';

/**
 * Generate a bitcoin script for a multisign interaction
 */
export class MultiSignGenerator {
    public static readonly MAXIMUM_SUPPORTED_SIGNATURE = 255;

    public static compile(
        vaultPublicKeys: Buffer[],
        minimumSignatures: number = 0,
        internal?: Buffer,
    ): Buffer {
        if (minimumSignatures < 2) {
            throw new Error('Minimum signatures must be greater than 1');
        }

        if (vaultPublicKeys.length < minimumSignatures) {
            throw new Error('The amount of public keys is lower than the minimum required');
        }

        if (minimumSignatures > MultiSignGenerator.MAXIMUM_SUPPORTED_SIGNATURE) {
            throw new Error(`The maximum amount of signatures is ${MultiSignGenerator.MAXIMUM_SUPPORTED_SIGNATURE}`);
        }

        const minimumRequired = Buffer.alloc(1);
        minimumRequired.writeUInt8(minimumSignatures);

        /** Remove duplicates **/
        vaultPublicKeys = vaultPublicKeys.filter((buf, index, self) =>
            index === self.findIndex(otherBuf => buf.equals(otherBuf))
        );

        /** We must order the pub keys. */
        vaultPublicKeys = vaultPublicKeys.sort((a, b) => a.compare(b));

        let included = false;
        const data = vaultPublicKeys.map((key) => {
            let newKey = toXOnly(key);
            if (internal && !included) included = internal.equals(newKey);

            return newKey;
        });

        if (internal && !included) data.push(internal);
        const compiledData: (number | Buffer)[] = [
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
