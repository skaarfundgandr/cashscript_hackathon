import { Database } from 'bun:sqlite';
import { ContractRecord, IContractStore } from '../../application/ports/contract-store.js';
import type { ParcelUtxo } from '../../domain/index.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contracts (
  contract_address    TEXT PRIMARY KEY,
  recipient_pkh       TEXT NOT NULL,
  merchant_pkh        TEXT NOT NULL,
  delivery_code_hash  TEXT NOT NULL,
  registry_pk         TEXT NOT NULL
)`;

interface ContractRow {
  contract_address: string;
  recipient_pkh: string;
  merchant_pkh: string;
  delivery_code_hash: string;
  registry_pk: string;
}

export class SqliteContractStore implements IContractStore {
  constructor(private readonly db: Database) {
    this.db.run(SCHEMA);
  }

  save(record: ContractRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO contracts (contract_address, recipient_pkh, merchant_pkh, delivery_code_hash, registry_pk)
         VALUES ($contractAddress, $recipientPkh, $merchantPkh, $deliveryCodeHash, $registryPk)`,
      )
      .run({
        $contractAddress: record.contractAddress,
        $recipientPkh: record.recipientPkh,
        $merchantPkh: record.merchantPkh,
        $deliveryCodeHash: record.deliveryCodeHash,
        $registryPk: record.registryPk,
      });
  }

  find(contractId: string): ContractRecord | null {
    const row = this.db
      .query('SELECT * FROM contracts WHERE contract_address = $contractAddress')
      .get({ $contractAddress: contractId }) as ContractRow | null;
    if (!row) return null;
    return {
      contractAddress: row.contract_address,
      recipientPkh: row.recipient_pkh,
      merchantPkh: row.merchant_pkh,
      deliveryCodeHash: row.delivery_code_hash,
      registryPk: row.registry_pk,
    };
  }

  getContractAddress(contractId: string): string {
    return contractId;
  }

  async getParcelUtxo(contractId: string): Promise<ParcelUtxo | null> {
    return null;
  }
}
