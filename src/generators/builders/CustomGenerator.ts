import { Network, networks, script, Stack, XOnlyPublicKey } from '@btc-vision/bitcoin';
import { Generator } from '../Generator.js';

/**
 * Class to generate bitcoin script for interaction transactions
 */
export class CustomGenerator extends Generator {
    constructor(senderPubKey: XOnlyPublicKey, network: Network = networks.bitcoin) {
        super(senderPubKey, undefined, network);
    }

    /**
     * Compile an interaction bitcoin script
     * @param compiledData - The compiled data
     * @returns {Uint8Array} - The compiled script
     * @throws {Error} - If something goes wrong
     */
    public compile(compiledData: (Uint8Array | Stack)[]): Uint8Array {
        const asm = compiledData.flat();
        const compiled = script.compile(asm);

        /** Verify the validity of the script */
        const decompiled = script.decompile(compiled);
        if (!decompiled) {
            throw new Error('Failed to decompile script??');
        }

        return compiled;
    }
}
