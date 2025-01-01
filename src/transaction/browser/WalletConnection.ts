import { Address } from '../../opnet';
import { UnisatSigner } from './extensions/UnisatSigner';
import { XverseSigner } from './extensions/XverseSigner';

export enum SupportedWallets {
    Unisat = 'unisat',
    Xverse = 'xverse',
}

export class WalletConnection {
    public wallet_type: SupportedWallets | null = null;

    private unisatSigner: UnisatSigner | null = null; // OP_WALLET and Unisat wallet
    private xverseSigner: XverseSigner | null = null;

    public async connect(): Promise<void> {
        if (this.wallet_type) {
            throw new Error('Wallet already connected');
        }

        this.unisatSigner = new UnisatSigner();
        this.xverseSigner = new XverseSigner();

        if (window.opnet || window.unisat) {
            try {
                await this.unisatSigner.init();
                this.wallet_type = SupportedWallets.Unisat;
                return;
            } catch (error: unknown) {
                if (error instanceof Error) {
                    throw new Error(error.message);
                }

                throw new Error('Error connecting wallet');
            }
        }

        if (window.BitcoinProvider) {
            try {
                await this.xverseSigner.init();
                this.wallet_type = SupportedWallets.Xverse;
                return;
            } catch (error: unknown) {
                if (error instanceof Error) {
                    throw new Error(error.message);
                }

                throw new Error('Error connecting wallet');
            }
        }

        throw new Error('Wallet not found');
    }

    public async disconnect(): Promise<void> {
        if (!this.unisatSigner || !this.xverseSigner) {
            throw new Error('Wallet not connected');
        }

        if (this.wallet_type === SupportedWallets.Unisat) {
            this.unisatSigner.unisat.disconnect();
        } else {
            await this.xverseSigner.BitcoinProvider.request('wallet_disconnect', null);
        }

        this.wallet_type = null;
    }

    public async switchTo(walletType: SupportedWallets): Promise<void> {
        if (!this.unisatSigner || !this.xverseSigner) {
            throw new Error('Wallet not connected');
        }

        if (this.wallet_type === walletType) return;

        if (walletType === SupportedWallets.Unisat) {
            await this.unisatSigner.init();
            this.wallet_type = SupportedWallets.Unisat;
        } else {
            await this.xverseSigner.init();
            this.wallet_type = SupportedWallets.Xverse;
        }
    }

    public getAddress(): Address {
        if (!this.unisatSigner || !this.xverseSigner) {
            throw new Error('Wallet not connected');
        }

        if (this.wallet_type === SupportedWallets.Unisat) {
            return Address.fromString(this.unisatSigner.getPublicKey().toString('hex'));
        }

        return Address.fromString(this.xverseSigner.getPublicKey().toString('hex'));
    }

    public getSigner(): UnisatSigner | XverseSigner {
        if (!this.unisatSigner || !this.xverseSigner) {
            throw new Error('Wallet not connected');
        }

        if (this.wallet_type === SupportedWallets.Unisat) {
            return this.unisatSigner;
        }

        return this.xverseSigner;
    }
}

export default WalletConnection;
