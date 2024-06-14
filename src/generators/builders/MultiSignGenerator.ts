import { opcodes, script } from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';

/**
 * Generate a bitcoin script for a multisign interaction
 */
export class MultiSignGenerator {
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

        if (minimumSignatures > 255) {
            throw new Error('The maximum amount of signatures is 255');
        }

        const minimumRequired = Buffer.alloc(1);
        minimumRequired.writeUInt8(minimumSignatures);

        let included = false;
        const data = vaultPublicKeys.map((key) => {
            let newKey = toXOnly(key);

            if (internal && !included) included = internal.equals(newKey);

            return newKey; //[key, opcodes.OP_CHECKSIGVERIFY];
        });

        if (internal && !included) data.push(internal);

        /*const compiledData: (number | Buffer)[] = [
            this.internal,
            opcodes.OP_CHECKSIGVERIFY,
            ...data.flat(),
            opcodes.OP_1,

            //Buffer.from('03e68ee236fcc34933d493b305a6f0c7561259471d13ecd10dfe0e37633a7cbe', 'hex'),
            //opcodes.OP_CHECKSIGVERIFY,
        ];

        console.log(compiledData);*/

        const compiledData: (number | Buffer)[] = [
            // Push the initial 0 (for OP_CHECKSIGADD)
            opcodes.OP_0,

            // For each public key, add CHECKSIGADD operation
            ...data.flatMap((key, index) => [
                key, // Public key
                opcodes.OP_CHECKSIGADD,
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
