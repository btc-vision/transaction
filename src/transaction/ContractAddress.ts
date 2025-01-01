import { Secp256k1PointDeriver } from '../keypair/Secp256k1PointDeriver.js';

class ContractAddressBase {
    private readonly deriver: Secp256k1PointDeriver = new Secp256k1PointDeriver();

    public generateHybridKeyFromHash(input: Buffer): Buffer {
        const p = this.deriver.findOrDeriveValidPoint(this.cloneBuffer(input), false);
        const y = this.deriver.getCanonicalY(p.y1, p.y2);
        return Buffer.from(this.deriver.getHybridPublicKey(p.x, y));
    }

    private cloneBuffer(buffer: Buffer): Buffer {
        return Buffer.from(buffer);
    }
}

export const ContractAddress = new ContractAddressBase();
