import { Secp256k1PointDeriver } from '../keypair/Secp256k1PointDeriver.js';

class ContractAddressBase {
    private readonly deriver: Secp256k1PointDeriver = new Secp256k1PointDeriver();

    public generateHybridKeyFromHash(input: Uint8Array): Uint8Array {
        const p = this.deriver.findOrDeriveValidPoint(new Uint8Array(input), false);
        const y = this.deriver.getCanonicalY(p.y1, p.y2);
        return new Uint8Array(this.deriver.getHybridPublicKey(p.x, y));
    }
}

export const ContractAddress = new ContractAddressBase();
