import fs from 'node:fs';
import path from 'node:path';
import { binToHex, encodeCashAddress, hash160 } from '@bitauth/libauth';
import { derivePublicKey } from '../libauth/key-store.js';
import { Contract, ElectrumNetworkProvider, Network, SignatureTemplate, TransactionBuilder } from 'cashscript';
import type { Artifact, Contract as ContractInstance, Unlocker, Utxo } from 'cashscript';
import { IParcelContract } from '../../application/ports/parcel-contract.js';
import { encodeCommitment, ParcelState } from '../../domain/index.js';

const FEE_SATS = 1000n;
const CHANGE_FEE_RATE = 1;
const ZERO_PKH = new Uint8Array(20);
const BCH_TEST_PREFIX = 'bchtest';

interface CachedContract {
  contract: ContractInstance<Artifact>;
  recipientPkh: Uint8Array;
  merchantPkh: Uint8Array;
}

const isNftUtxo = (utxo: Utxo): boolean =>
  utxo.token !== undefined && utxo.token.amount === 0n && utxo.token.nft !== undefined;

export class CashScriptParcelTracker implements IParcelContract {
  private readonly network: ElectrumNetworkProvider;
  private artifact: Artifact | undefined;
  private readonly contracts: Map<string, CachedContract> = new Map();

  constructor() {
    this.network = new ElectrumNetworkProvider(Network.CHIPNET);
  }

  private loadArtifact(): Artifact {
    if (!this.artifact) {
      const artifactPath = path.resolve(import.meta.dirname, '../../../../../artifacts/ParcelTracker.json');
      this.artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8')) as Artifact;
    }
    return this.artifact;
  }

  async deploy(merchantPk: Uint8Array, recipientPkh: Uint8Array, initialCustodian: Uint8Array, fundingSatoshis: bigint): Promise<{ contractId: string; address: string; txid: string }> {
    assertBytes20(recipientPkh, 'recipientPkh');
    assertBytes20(initialCustodian, 'initialCustodian');
    assertPrivateKey(merchantPk);

    const merchantPub = derivePublicKey(merchantPk);
    const merchantPkh = hash160(merchantPub);
    const contract = new Contract(this.loadArtifact(), [recipientPkh, merchantPkh], { provider: this.network });
    const merchantAddress = encodeCashAddress({ prefix: BCH_TEST_PREFIX, type: 'p2pkh', payload: merchantPkh }).address;

    const fundingUtxo = await this.pickBchUtxo(merchantAddress);
    const fundingTxid = await this.sendFundingTx(contract, fundingUtxo, merchantAddress, merchantPk, fundingSatoshis + FEE_SATS);

    const genesisUtxo: Utxo = { txid: fundingTxid, vout: 0, satoshis: fundingSatoshis + FEE_SATS };
    const commitment = binToHex(encodeCommitment(ParcelState.InCustody, initialCustodian));
    const unlocker = contract.unlock.mint(new SignatureTemplate(merchantPk), binToHex(merchantPub), binToHex(initialCustodian));
    const txid = await this.sendNftTransition(genesisUtxo, unlocker, contract, fundingSatoshis, fundingTxid, commitment);

    this.contracts.set(contract.address, { contract, recipientPkh, merchantPkh });
    return { contractId: contract.address, address: contract.address, txid };
  }

  async handoff(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array, nextCustodian: Uint8Array): Promise<string> {
    assertBytes20(nextCustodian, 'nextCustodian');
    const { contract } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.handoff(new SignatureTemplate(courierSig), binToHex(courierPk), binToHex(nextCustodian));
    return this.spendNft(contractId, unlocker, ParcelState.HandoffPending, nextCustodian);
  }

  async acceptHandoff(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.acceptHandoff(new SignatureTemplate(courierSig), binToHex(courierPk));
    return this.spendNft(contractId, unlocker, ParcelState.InCustody, hash160(courierPk));
  }

  async requestDelivery(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array): Promise<string> {
    const { contract, recipientPkh } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.requestDelivery(new SignatureTemplate(courierSig), binToHex(courierPk));
    return this.spendNft(contractId, unlocker, ParcelState.DeliveryPending, recipientPkh);
  }

  async confirmDelivery(contractId: string, recipientSig: Uint8Array, recipientPk: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.confirmDelivery(new SignatureTemplate(recipientSig), binToHex(recipientPk));
    return this.spendNft(contractId, unlocker, ParcelState.Delivered, ZERO_PKH);
  }

  async reject(contractId: string, recipientSig: Uint8Array, recipientPk: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.reject(new SignatureTemplate(recipientSig), binToHex(recipientPk));
    return this.spendNft(contractId, unlocker, ParcelState.Rejected, ZERO_PKH);
  }

  async returnToSender(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array): Promise<string> {
    const { contract, merchantPkh } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.returnToSender(new SignatureTemplate(courierSig), binToHex(courierPk));
    return this.spendNft(contractId, unlocker, ParcelState.ReturnPending, merchantPkh);
  }

  async confirmReturn(contractId: string, merchantSig: Uint8Array, merchantPk: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.confirmReturn(new SignatureTemplate(merchantSig), binToHex(merchantPk));
    return this.spendNft(contractId, unlocker, ParcelState.Returned, ZERO_PKH);
  }

  private async spendNft(contractId: string, unlocker: Unlocker, newState: ParcelState, newCustodian: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const utxos = await contract.getUtxos();
    const nftUtxo = utxos.find(isNftUtxo);
    if (!nftUtxo || !nftUtxo.token?.nft) {
      throw new Error(`No parcel NFT UTXO found for contract ${contractId}`);
    }
    const commitment = binToHex(encodeCommitment(newState, newCustodian));
    return this.sendNftTransition(
      nftUtxo,
      unlocker,
      contract,
      nftUtxo.satoshis - FEE_SATS,
      nftUtxo.token.category,
      commitment,
    );
  }

  private async sendNftTransition(utxo: Utxo, unlocker: Unlocker, contract: ContractInstance<Artifact>, value: bigint, category: string, commitment: string): Promise<string> {
    const tx = await new TransactionBuilder({ provider: this.network })
      .addInput(utxo, unlocker)
      .addOutput({
        to: contract.tokenAddress,
        amount: value,
        token: {
          amount: 0n,
          category,
          nft: { capability: 'mutable', commitment },
        },
      })
      .send();
    return tx.txid;
  }

  private async sendFundingTx(contract: ContractInstance<Artifact>, fundingUtxo: Utxo, merchantAddress: string, merchantKey: Uint8Array, amount: bigint): Promise<string> {
    const tx = await new TransactionBuilder({ provider: this.network })
      .addInput(fundingUtxo, new SignatureTemplate(merchantKey).unlockP2PKH())
      .addOutput({ to: contract.address, amount })
      .addBchChangeOutputIfNeeded({ to: merchantAddress, feeRate: CHANGE_FEE_RATE })
      .send();
    return tx.txid;
  }

  private async pickBchUtxo(address: string): Promise<Utxo> {
    const utxos = await this.network.getUtxos(address);
    const spendable = utxos.filter((utxo) => utxo.token === undefined);
    if (spendable.length === 0) {
      throw new Error(`No spendable BCH UTXO available at ${address}; fund the merchant address first`);
    }
    return spendable.reduce((largest, utxo) => (utxo.satoshis > largest.satoshis ? utxo : largest));
  }

  private getCachedContract(contractId: string): CachedContract {
    const cached = this.contracts.get(contractId);
    if (!cached) {
      throw new Error(`Unknown contract ${contractId}; deploy the parcel in this process before transitioning it`);
    }
    return cached;
  }
}

function assertBytes20(value: Uint8Array, name: string): void {
  if (value.length !== 20) {
    throw new Error(`${name} must be a 20-byte hash160, got ${value.length} bytes`);
  }
}

function assertPrivateKey(value: Uint8Array): void {
  if (value.length !== 32) {
    throw new Error(`Private key must be 32 bytes, got ${value.length} bytes`);
  }
}
