import { describe, expect, it } from 'bun:test';
import { binToHex, encodeCashAddress, encodeTransactionBCH, hashTransaction, hexToBin } from '@bitauth/libauth';
import type { Utxo } from 'cashscript';
import { encodeCommitment } from '../domain/index.js';
import { CashScriptParcelTracker } from '../infrastructure/cashscript/ParcelTracker.js';

const CONTRACT_ADDRESS = 'bchtest:contract';
const CATEGORY = new Uint8Array(32).fill(7);
const EMPTY_PKH = new Uint8Array(20);

interface ParcelHop {
  state: number;
  custodian: Uint8Array;
}

function p2pkhBytecode(pkh: Uint8Array): Uint8Array {
  return Uint8Array.from([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]);
}

function nftUtxo(txid: string, commitment: Uint8Array, capability: 'mutable' | 'none'): Utxo {
  return {
    txid,
    vout: 0,
    satoshis: 1000n,
    token: {
      amount: 0n,
      category: binToHex(CATEGORY),
      nft: { capability, commitment: binToHex(commitment) },
    },
  };
}

function buildFakeChain(states: Array<ParcelHop>, tipAddress: string): { utxos: Map<string, Utxo[]>; rawTxs: Map<string, string> } {
  const utxos = new Map<string, Utxo[]>();
  const rawTxs = new Map<string, string>();

  const genesis = {
    version: 2,
    inputs: [{ outpointTransactionHash: new Uint8Array(32), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }],
    outputs: [{ lockingBytecode: p2pkhBytecode(EMPTY_PKH), valueSatoshis: 5000n }],
    locktime: 0,
  };
  rawTxs.set('0'.repeat(64), binToHex(encodeTransactionBCH(genesis)));

  let prevTxid: string | undefined;
  for (let i = 0; i < states.length; i++) {
    const commitment = encodeCommitment(states[i].state, states[i].custodian);
    const capability = i === states.length - 1 ? 'none' : 'mutable';
    const tx = {
      version: 2,
      inputs: [
        prevTxid === undefined
          ? { outpointTransactionHash: new Uint8Array(32), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }
          : { outpointTransactionHash: hexToBin(prevTxid), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() },
      ],
      outputs: [
        {
          lockingBytecode: p2pkhBytecode(EMPTY_PKH),
          valueSatoshis: 1000n,
          token: { amount: 0n, category: CATEGORY, nft: { capability, commitment } },
        },
      ],
      locktime: 0,
    };
    const encoded = encodeTransactionBCH(tx);
    const txid = hashTransaction(encoded);
    rawTxs.set(txid, binToHex(encoded));
    if (i === states.length - 1) {
      utxos.set(tipAddress, [nftUtxo(txid, commitment, capability)]);
    }
    prevTxid = txid;
  }
  return { utxos, rawTxs };
}

class FakeProvider {
  constructor(
    private readonly utxos: Map<string, Utxo[]>,
    private readonly rawTxs: Map<string, string>,
  ) {}

  async getUtxos(address: string): Promise<Utxo[]> {
    return this.utxos.get(address) ?? [];
  }

  async getRawTransaction(txid: string): Promise<string> {
    const raw = this.rawTxs.get(txid);
    if (raw === undefined) {
      throw new Error(`Unknown txid ${txid}`);
    }
    return raw;
  }
}

function makeTracker(utxos: Map<string, Utxo[]>, rawTxs: Map<string, string>): CashScriptParcelTracker {
  return new CashScriptParcelTracker(new FakeProvider(utxos, rawTxs) as any);
}

describe('CashScriptParcelTracker.getParcelHistory', () => {
  it('returns entries oldest-first for NFT at contract address', async () => {
    const states: Array<ParcelHop> = [
      { state: 0, custodian: new Uint8Array(20).fill(1) },
      { state: 1, custodian: new Uint8Array(20).fill(2) },
      { state: 2, custodian: new Uint8Array(20).fill(3) },
    ];
    const { utxos, rawTxs } = buildFakeChain(states, CONTRACT_ADDRESS);
    const tracker = makeTracker(utxos, rawTxs);

    const history = await tracker.getParcelHistory(CONTRACT_ADDRESS);

    expect(history).toHaveLength(3);
    expect(history.map((e) => e.state)).toEqual([0, 1, 2]);
    expect(history.map((e) => e.custodian)).toEqual(states.map((s) => binToHex(s.custodian)));
  });

  it('throws when no NFT found anywhere', async () => {
    const tracker = makeTracker(new Map(), new Map());

    await expect(tracker.getParcelHistory(CONTRACT_ADDRESS)).rejects.toThrow(/No parcel NFT UTXO found for contract/);
  });

  it('single hop (mint only) returns one entry', async () => {
    const { utxos, rawTxs } = buildFakeChain([{ state: 0, custodian: new Uint8Array(20).fill(1) }], CONTRACT_ADDRESS);
    const tracker = makeTracker(utxos, rawTxs);

    const history = await tracker.getParcelHistory(CONTRACT_ADDRESS);

    expect(history).toHaveLength(1);
    expect(history[0].state).toBe(0);
  });

  it('returns full history when NFT is at recipient address (delivered)', async () => {
    const states: Array<ParcelHop> = [
      { state: 0, custodian: new Uint8Array(20).fill(1) },
      { state: 1, custodian: new Uint8Array(20).fill(2) },
      { state: 0, custodian: new Uint8Array(20).fill(3) },
      { state: 2, custodian: new Uint8Array(20).fill(4) },
      { state: 4, custodian: new Uint8Array(20).fill(5) },
    ];
    const recipientPkh = new Uint8Array(20).fill(9);
    const recipientAddress = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: recipientPkh }).address;
    const { utxos, rawTxs } = buildFakeChain(states, recipientAddress);
    const tracker = makeTracker(utxos, rawTxs);
    (tracker as any).contracts.set(CONTRACT_ADDRESS, { contract: {}, recipientPkh });

    const history = await tracker.getParcelHistory(CONTRACT_ADDRESS);

    expect(history).toHaveLength(5);
    expect(history.map((e) => e.state)).toEqual([0, 1, 0, 2, 4]);
  });

  it('delivered parcel history ends with ParcelState.Delivered', async () => {
    const recipientPkh = new Uint8Array(20).fill(9);
    const recipientAddress = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: recipientPkh }).address;
    const { utxos, rawTxs } = buildFakeChain(
      [
        { state: 0, custodian: new Uint8Array(20).fill(1) },
        { state: 1, custodian: new Uint8Array(20).fill(2) },
        { state: 0, custodian: new Uint8Array(20).fill(3) },
        { state: 2, custodian: new Uint8Array(20).fill(4) },
        { state: 4, custodian: new Uint8Array(20).fill(5) },
      ],
      recipientAddress,
    );
    const tracker = makeTracker(utxos, rawTxs);
    (tracker as any).contracts.set(CONTRACT_ADDRESS, { contract: {}, recipientPkh });

    const history = await tracker.getParcelHistory(CONTRACT_ADDRESS);

    expect(history[history.length - 1].state).toBe(4);
  });
});
