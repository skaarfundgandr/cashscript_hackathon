import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { binToHex, hash160, hexToBin } from '@bitauth/libauth';
import { Contract } from 'cashscript';
import type { Artifact } from 'cashscript';
import { derivePublicKey } from '../infrastructure/libauth/key-store.js';
import { CashScriptParcelTracker } from '../infrastructure/cashscript/ParcelTracker.js';
import { SqliteContractStore } from '../infrastructure/memory/sqlite-contract-store.js';

function makeRecord(): {
  contractAddress: string;
  recipientPkh: string;
  merchantPkh: string;
  deliveryCodeHash: string;
  registryPk: string;
  nftCategory: string;
} {
  const merchantPk = new Uint8Array(32).fill(1);
  return {
    contractAddress: 'bchtest:contract',
    recipientPkh: binToHex(new Uint8Array(20).fill(2)),
    merchantPkh: binToHex(hash160(derivePublicKey(merchantPk))),
    deliveryCodeHash: binToHex(new Uint8Array(32).fill(3)),
    registryPk: binToHex(new Uint8Array(32).fill(4)),
    nftCategory: binToHex(new Uint8Array(32).fill(5)),
  };
}

describe('SqliteContractStore', () => {
  it('saves and finds a record', () => {
    const store = new SqliteContractStore(new Database(':memory:'));
    const record = makeRecord();

    store.save(record);

    const found = store.find(record.contractAddress);
    expect(found).toEqual(record);
  });

  it('returns null for unknown contract', () => {
    const store = new SqliteContractStore(new Database(':memory:'));

    expect(store.find('bchtest:unknown')).toBeNull();
  });

  it('replaces an existing record on save', () => {
    const store = new SqliteContractStore(new Database(':memory:'));
    const record = makeRecord();
    store.save(record);

    const updated = { ...record, recipientPkh: binToHex(new Uint8Array(20).fill(9)) };
    store.save(updated);

    expect(store.find(record.contractAddress)).toEqual(updated);
  });
});

function makeArtifact(): unknown {
  return {
    abi: [],
    bytecode: '',
    constructorInputs: [
      { name: 'recipientPkh', type: 'bytes20' },
      { name: 'merchantPkh', type: 'bytes20' },
      { name: 'deliveryCodeHash', type: 'bytes32' },
      { name: 'registryPk', type: 'bytes32' },
    ],
    contractName: 'ParcelTracker',
    compiler: { name: 'cashc', version: '0.10.0' },
    source: '',
  };
}

describe('CashScriptParcelTracker rehydration', () => {
  it('rehydrates a contract from the store on cache miss', () => {
    const store = new SqliteContractStore(new Database(':memory:'));
    const record = makeRecord();
    const artifact = makeArtifact() as Artifact;
    const contract = new Contract(artifact, [hexToBin(record.recipientPkh), hexToBin(record.merchantPkh), hexToBin(record.deliveryCodeHash), hexToBin(record.registryPk)], { provider: {} } as any);
    store.save({ ...record, contractAddress: contract.address });
    const tracker = new CashScriptParcelTracker({} as any, store);
    (tracker as any).artifact = artifact;

    const cached = (tracker as any).getCachedContract(contract.address);

    expect(cached.contract).toBeDefined();
    expect(binToHex(cached.recipientPkh)).toBe(record.recipientPkh);
  });

  it('throws on cache miss when no store is configured', () => {
    const tracker = new CashScriptParcelTracker({} as any);

    expect(() => (tracker as any).getCachedContract('bchtest:contract')).toThrow(/Unknown contract/);
  });
});
