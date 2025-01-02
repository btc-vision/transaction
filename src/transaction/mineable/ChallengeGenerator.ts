import bitcoin, { Network } from '@btc-vision/bitcoin';
import { MineableReward } from '../../generators/builders/MineableReward.js';

export interface IMineableReward {
    address: string;
    p2shOutputScript: Buffer;
    redeemScript: Buffer;
}

export class ChallengeGenerator {
    public static generateMineableReward(preimage1: Buffer, network: Network): IMineableReward {
        const mineableReward = new MineableReward(Buffer.alloc(0), network);
        const redeemScript = mineableReward.compile(preimage1);
        const p2sh = bitcoin.payments.p2sh({
            redeem: { output: redeemScript },
            network,
        });

        const outputRedeem: Buffer | undefined = p2sh.redeem?.output;
        if (!outputRedeem) {
            throw new Error('Output redeem is required');
        }

        if (!p2sh.address) {
            throw new Error('P2SH address is required');
        }

        const p2shOutputScript: Buffer | undefined = p2sh?.redeem?.output;
        if (!p2shOutputScript) {
            throw new Error('No redeem output');
        }

        return {
            address: p2sh.address,
            p2shOutputScript,
            redeemScript: redeemScript,
        };
    }
}
