import fs from 'node:fs';
import path from 'node:path';
import { binToHex, decodeTransactionBCH, encodeCashAddress, hash160, hexToBin } from '@bitauth/libauth';
import type { Input, TransactionCommon } from '@bitauth/libauth';
import { derivePublicKey } from '../libauth/key-store.js';
import { Contract, ElectrumNetworkProvider, Network, SignatureTemplate, TransactionBuilder } from 'cashscript';
import type { Artifact, Contract as ContractInstance, Unlocker, Utxo } from 'cashscript';
import { IParcelContract, ParcelHistoryEntry } from '../../application/ports/parcel-contract.js';
import { IContractStore } from '../../application/ports/contract-store.js';
import { decodeCommitment, encodeCommitment, ParcelState } from '../../domain/index.js';

const FEE_SATS = 2000n;
const CHANGE_FEE_RATE = 1;
const BCH_TEST_PREFIX = 'bchtest';

interface CachedContract {
  contract: ContractInstance<Artifact>;
  recipientPkh: Uint8Array;
}

type NftUtxo = Utxo & {
  token: { amount: bigint; category: string; nft: { capability: string; commitment: string } };
};

const isNftUtxo = (utxo: Utxo): utxo is NftUtxo =>
  utxo.token !== undefined && utxo.token.amount === 0n && utxo.token.nft !== undefined;

function assertDecodedTx(tx: TransactionCommon | string): TransactionCommon {
  if (typeof tx === 'string') {
    throw new Error(tx);
  }
  return tx;
}

export class CashScriptParcelTracker implements IParcelContract {
  private readonly network: ElectrumNetworkProvider;
  private artifact: Artifact | undefined;
  private readonly contracts: Map<string, CachedContract> = new Map();
  private readonly store: IContractStore | undefined;

  constructor(provider?: ElectrumNetworkProvider, store?: IContractStore) {
    this.network = provider ?? new ElectrumNetworkProvider(Network.CHIPNET);
    this.store = store;
  }

  private loadArtifact(): Artifact {
    if (!this.artifact) {
      const artifactPath = path.resolve(import.meta.dirname, '../../../../../artifacts/ParcelTracker.json');
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8')) as Artifact;

      // CashScript 0.13.2 misplaces compiler-injected parameter validation when it
      // reconstructs multi-function contracts from debug metadata. TransactionBuilder
      // then rejects valid transactions during its pre-broadcast local evaluation.
      // Without this metadata it evaluates the exact compiled bytecode instead.
      delete artifact.debug;
      this.artifact = artifact;
    }
    return this.artifact;
  }

  async deploy(merchantPk: Uint8Array, recipientPkh: Uint8Array, initialCustodian: Uint8Array, fundingSatoshis: bigint, deliveryCodeHash: Uint8Array, registryPk: Uint8Array): Promise<{ contractId: string; address: string; txid: string }> {
    assertBytes20(recipientPkh, 'recipientPkh');
    assertBytes20(initialCustodian, 'initialCustodian');
    assertBytes32(deliveryCodeHash, 'deliveryCodeHash');
    assertPrivateKey(merchantPk);

    const merchantPub = derivePublicKey(merchantPk);
    const merchantPkh = hash160(merchantPub);
    const contract = new Contract(this.loadArtifact(), [recipientPkh, merchantPkh, deliveryCodeHash, registryPk], { provider: this.network });
    const merchantAddress = encodeCashAddress({ prefix: BCH_TEST_PREFIX, type: 'p2pkh', payload: merchantPkh }).address;

    const fundingUtxo = await this.pickBchUtxo(merchantAddress);
    const fundingTxid = await this.sendFundingTx(contract, fundingUtxo, merchantAddress, merchantPk, fundingSatoshis + FEE_SATS);

    const genesisUtxo: Utxo = { txid: fundingTxid, vout: 0, satoshis: fundingSatoshis + FEE_SATS };
    const commitment = binToHex(encodeCommitment(ParcelState.InCustody, initialCustodian));
    const unlocker = contract.unlock.mint(new SignatureTemplate(merchantPk), binToHex(merchantPub), binToHex(initialCustodian));
    const txid = await this.sendNftTransition(genesisUtxo, unlocker, contract, fundingSatoshis, fundingTxid, commitment, contract.tokenAddress, 'mutable');

    this.contracts.set(contract.address, { contract, recipientPkh });
    this.store?.save({
      contractAddress: contract.address,
      recipientPkh: binToHex(recipientPkh),
      merchantPkh: binToHex(merchantPkh),
      deliveryCodeHash: binToHex(deliveryCodeHash),
      registryPk: binToHex(registryPk),
      nftCategory: fundingTxid,
    });
    return { contractId: contract.address, address: contract.address, txid };
  }

  async handoff(contractId: string, courierKey: Uint8Array, courierPk: Uint8Array, nextCustodian: Uint8Array, registryAttestation: Uint8Array): Promise<string> {
    assertBytes20(nextCustodian, 'nextCustodian');
    const { contract } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.handoff(new SignatureTemplate(courierKey), binToHex(courierPk), binToHex(nextCustodian), binToHex(registryAttestation));
    return this.spendNft(contractId, unlocker, ParcelState.HandoffPending, nextCustodian);
  }

  async acceptHandoff(contractId: string, courierKey: Uint8Array, courierPk: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.acceptHandoff(new SignatureTemplate(courierKey), binToHex(courierPk));
    return this.spendNft(contractId, unlocker, ParcelState.InCustody, hash160(courierPk));
  }

  async requestDelivery(contractId: string, courierKey: Uint8Array, courierPk: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.requestDelivery(new SignatureTemplate(courierKey), binToHex(courierPk));
    return this.spendNft(contractId, unlocker, ParcelState.DeliveryPending, hash160(courierPk));
  }

  async confirmDelivery(contractId: string, recipientKey: Uint8Array, recipientPk: Uint8Array, deliveryCode: Uint8Array): Promise<string> {
    const { contract, recipientPkh } = this.getCachedContract(contractId);
    const unlocker = contract.unlock.confirmDelivery(new SignatureTemplate(recipientKey), binToHex(recipientPk), binToHex(deliveryCode));
    return this.spendNftToRecipient(contractId, unlocker, recipientPkh);
  }

  async getParcelHistory(contractId: string): Promise<Array<ParcelHistoryEntry>> {
    const utxos = await this.network.getUtxos(contractId);
    let nftUtxo = utxos.find(isNftUtxo);
    if (!nftUtxo) {
      let recipientPkh: Uint8Array | undefined;
      const cached = this.contracts.get(contractId);
      if (cached) {
        recipientPkh = cached.recipientPkh;
      } else {
        const record = this.store?.find(contractId);
        if (record) {
          recipientPkh = hexToBin(record.recipientPkh);
        }
      }
      if (recipientPkh) {
        const recipientAddress = encodeCashAddress({ prefix: BCH_TEST_PREFIX, type: 'p2pkh', payload: recipientPkh }).address;
        const recipientUtxos = await this.network.getUtxos(recipientAddress);
        const record = this.store?.find(contractId);
        nftUtxo = record
          ? recipientUtxos.find((u): u is NftUtxo => isNftUtxo(u) && u.token.category === record.nftCategory)
          : recipientUtxos.find(isNftUtxo);
      }
    }
    if (!nftUtxo || !nftUtxo.token?.nft) {
      throw new Error(`No parcel NFT UTXO found for contract ${contractId}`);
    }
    const entries: ParcelHistoryEntry[] = [];
    let txid = nftUtxo.txid;
    let commitment = nftUtxo.token.nft.commitment;
    while (true) {
      const { state, custodian } = decodeCommitment(hexToBin(commitment));
      entries.unshift({ txid, state, custodian: binToHex(custodian) });
      const tx = assertDecodedTx(decodeTransactionBCH(hexToBin(await this.network.getRawTransaction(txid))));
      const nftInput = await this.findNftInput(tx);
      if (nftInput === undefined) {
        break;
      }
      txid = binToHex(nftInput.outpointTransactionHash);
      const prevTx = assertDecodedTx(decodeTransactionBCH(hexToBin(await this.network.getRawTransaction(txid))));
      const nft = prevTx.outputs[nftInput.outpointIndex]?.token?.nft;
      if (nft === undefined) {
        break;
      }
      commitment = binToHex(nft.commitment);
    }
    return entries;
  }

  private async spendNft(contractId: string, unlocker: Unlocker, newState: ParcelState, newCustodian: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const nftUtxo = await this.findNftUtxo(contractId);
    const commitment = binToHex(encodeCommitment(newState, newCustodian));
    return this.sendNftTransition(
      nftUtxo,
      unlocker,
      contract,
      nftUtxo.satoshis - FEE_SATS,
      nftUtxo.token.category,
      commitment,
      contract.tokenAddress,
      'mutable',
    );
  }

  private async spendNftToRecipient(contractId: string, unlocker: Unlocker, recipientPkh: Uint8Array): Promise<string> {
    const { contract } = this.getCachedContract(contractId);
    const nftUtxo = await this.findNftUtxo(contractId);
    const { custodian, reason } = decodeCommitment(hexToBin(nftUtxo.token.nft.commitment));
    const commitment = binToHex(encodeCommitment(ParcelState.Delivered, custodian, reason));
    // `p2pkhWithTokens`, not `p2pkh`: delivery moves the NFT out of the covenant into the buyer's
    // hands, and CashTokens refuses to send a token to an address that does not declare token
    // support. Same payload and the same locking bytecode — only the cashaddr encoding differs, so
    // the read path in `getParcelHistory` still finds this UTXO under its plain-p2pkh form.
    const recipientAddress = encodeCashAddress({ prefix: BCH_TEST_PREFIX, type: 'p2pkhWithTokens', payload: recipientPkh }).address;
    return this.sendNftTransition(
      nftUtxo,
      unlocker,
      contract,
      nftUtxo.satoshis - FEE_SATS,
      nftUtxo.token.category,
      commitment,
      recipientAddress,
      'none',
    );
  }

  private async findNftUtxo(contractId: string): Promise<NftUtxo> {
    const { contract } = this.getCachedContract(contractId);
    const utxos = await contract.getUtxos();
    const nftUtxo = utxos.find(isNftUtxo);
    if (!nftUtxo || !nftUtxo.token?.nft) {
      throw new Error(`No parcel NFT UTXO found for contract ${contractId}`);
    }
    return nftUtxo;
  }

  private async findNftInput(tx: TransactionCommon): Promise<Input | undefined> {
    for (const input of tx.inputs) {
      const prevTx = assertDecodedTx(decodeTransactionBCH(hexToBin(await this.network.getRawTransaction(binToHex(input.outpointTransactionHash)))));
      if (prevTx.outputs[input.outpointIndex]?.token?.nft !== undefined) {
        return input;
      }
    }
    return undefined;
  }

  private async sendNftTransition(utxo: Utxo, unlocker: Unlocker, contract: ContractInstance<Artifact>, value: bigint, category: string, commitment: string, to: string, capability: 'mutable' | 'none'): Promise<string> {
    const builder = new TransactionBuilder({ provider: this.network })
      .addInput(utxo, unlocker)
      .addOutput({
        to,
        amount: value,
        token: {
          amount: 0n,
          category,
          nft: { capability, commitment },
        },
      });

    /*
     * Deliberately not `.send()`. In cashscript 0.13.2 `send()` pre-flights every standard-unlockable
     * input through a local `debug()` evaluation (`TransactionBuilder.js:334`) and throws before it
     * ever reaches the network. That evaluation returns a false negative for this covenant: it
     * reports `ParcelTracker.cash:10 … OP_VERIFY`, while libauth's own VM runs the identical
     * transaction to completion and chipnet accepts it. Broadcasting the built transaction skips
     * the broken pre-flight.
     *
     * The cost is that a genuine script failure now surfaces as the node's rejection text rather
     * than a line number. That is the honest trade: a real reason beats a fabricated one.
     */
    return this.network.sendRawTransaction(await builder.build());
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
    if (cached) return cached;

    const record = this.store?.find(contractId);
    if (record) {
      const recipientPkh = hexToBin(record.recipientPkh);
      const merchantPkh = hexToBin(record.merchantPkh);
      const deliveryCodeHash = hexToBin(record.deliveryCodeHash);
      const registryPk = hexToBin(record.registryPk);
      const contract = new Contract(this.loadArtifact(), [recipientPkh, merchantPkh, deliveryCodeHash, registryPk], { provider: this.network });
      if (contract.address !== contractId) {
        throw new Error(`Rehydrated contract address mismatch for ${contractId}: got ${contract.address}`);
      }
      const rehydrated: CachedContract = { contract, recipientPkh };
      this.contracts.set(contractId, rehydrated);
      return rehydrated;
    }

    throw new Error(`Unknown contract ${contractId}; deploy the parcel in this process before transitioning it`);
  }
}

function assertBytes20(value: Uint8Array, name: string): void {
  if (value.length !== 20) {
    throw new Error(`${name} must be a 20-byte hash160, got ${value.length} bytes`);
  }
}

function assertBytes32(value: Uint8Array, name: string): void {
  if (value.length !== 32) {
    throw new Error(`${name} must be a 32-byte value, got ${value.length} bytes`);
  }
}

function assertPrivateKey(value: Uint8Array): void {
  if (value.length !== 32) {
    throw new Error(`Private key must be 32 bytes, got ${value.length} bytes`);
  }
}
