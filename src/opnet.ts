import { Unisat } from './transaction/browser/types/Unisat.js';

export { version } from './_version.js';

/** Bytecode */
export * from './bytecode/Compressor.js';

/** Generators */
export * from './generators/builders/CalldataGenerator.js';
export * from './generators/builders/CustomGenerator.js';
export * from './generators/builders/DeploymentGenerator.js';
export * from './generators/builders/LegacyCalldataGenerator.js';
export * from './generators/builders/MultiSignGenerator.js';
export * from './generators/builders/P2WDAGenerator.js';
export * from './generators/Features.js';
export * from './generators/Generator.js';

export * from './transaction/mineable/TimelockGenerator.js';
export * from './transaction/mineable/IP2WSHAddress.js';
export * from './p2wda/P2WDADetector.js';

/** Address */
export * from './generators/AddressGenerator.js';
export * from './verification/TapscriptVerificator.js';

/** Key Pair */
export * from './keypair/AddressVerificator.js';
export * from './keypair/EcKeyPair.js';
export * from './keypair/interfaces/IWallet.js';
export * from './keypair/MessageSigner.js';
export * from './keypair/Wallet.js';

/** Mnemonic */
export * from './mnemonic/Mnemonic.js';
export * from './mnemonic/MnemonicStrength.js';
export * from './mnemonic/BIPStandard.js';

/** Quantum (ML-DSA) */
export {
    MLDSASecurityLevel,
    MLDSAKeyPair,
    QuantumBIP32Interface,
    QuantumBIP32API,
    QuantumSigner,
    QuantumBIP32Factory,
    QuantumDerivationPath,
} from '@btc-vision/bip32';

export * from './generators/MLDSAData.js';

/** Metadata */
export * from './metadata/ContractBaseMetadata.js';
export * from './network/ChainId.js';

/** Signer */
export * from './signer/TweakedSigner.js';

/** Transaction */
export * from './transaction/enums/TransactionType.js';
export * from './transaction/interfaces/ITransactionParameters.js';
export * from './transaction/interfaces/Tap.js';
export * from './transaction/TransactionFactory.js';

/** Builders */
export * from './transaction/builders/CustomScriptTransaction.js';
export * from './transaction/builders/DeploymentTransaction.js';
export * from './transaction/builders/FundingTransaction.js';
export * from './transaction/builders/InteractionTransaction.js';
export * from './transaction/builders/InteractionTransactionP2WDA.js';
export * from './transaction/builders/MultiSignTransaction.js';
export * from './transaction/builders/SharedInteractionTransaction.js';
export * from './transaction/builders/TransactionBuilder.js';
export * from './transaction/builders/CancelTransaction.js';

/** Epoch */
export * from './epoch/interfaces/IChallengeSolution.js';
export * from './epoch/validator/EpochValidator.js';
export * from './epoch/ChallengeSolution.js';

/** Utils */
export * from './utils/BitcoinUtils.js';
export * from './utils/lengths.js';

/** UTXO */
export * from './utxo/interfaces/IUTXO.js';
export * from './utxo/OPNetLimitedProvider.js';

/** Processor */
export * from './transaction/processor/PsbtTransaction.js';

/** Shared */
export * from './transaction/psbt/PSBTTypes.js';
export * from './transaction/shared/TweakedTransaction.js';
export * from './utxo/interfaces/BroadcastResponse.js';

export * from './transaction/shared/P2TR_MS.js';

/** Consensus */
export * from './consensus/Consensus.js';
export * from './consensus/ConsensusConfig.js';
export * from './consensus/metadata/RoswellConsensus.js';

/** Binary */
export * from './abi/ABICoder.js';
export * from './buffer/BinaryReader.js';
export * from './buffer/BinaryWriter.js';
export * from './deterministic/AddressMap.js';
export * from './deterministic/AddressSet.js';
export * from './deterministic/DeterministicMap.js';
export * from './deterministic/DeterministicSet.js';
export * from './event/NetEvent.js';
export * from './keypair/Address.js';
export * from './utils/BufferHelper.js';
export * from './utils/types.js';

/** Custom signers */
export * from './transaction/browser/BrowserSignerBase.js';
export * from './transaction/browser/extensions/UnisatSigner.js';
export * from './transaction/browser/extensions/XverseSigner.js';
export * from './transaction/browser/types/Unisat.js';
export * from './transaction/browser/types/Xverse.js';
export * from './transaction/browser/types/OPWallet.js';

export * from './metadata/tokens.js';
export * from './transaction/browser/Web3Provider.js';

export * from './keypair/Secp256k1PointDeriver.js';
export * from './transaction/ContractAddress.js';

export * from './deterministic/FastMap.js';
export * from './deterministic/CustomMap.js';

declare global {
    interface Window {
        unisat?: Unisat;
        opnet?: Unisat;
    }
}
