import { Database } from 'bun:sqlite';
import { ParcelStore } from '../../application/ports/index.js';
import { CustodyHop, Parcel } from '../../domain/parcel.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS parcels (
  parcel_id        TEXT PRIMARY KEY,
  recipient_pkh    TEXT NOT NULL,
  delivery_secret  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hops (
  parcel_id  TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  txid       TEXT NOT NULL,
  state      INTEGER NOT NULL,
  custodian  TEXT NOT NULL,
  PRIMARY KEY (parcel_id, seq)
)`;

/** Hops are append-only and read back by `seq`, which is what keeps the chain oldest → newest. */
export class SqliteParcelStore implements ParcelStore {
  constructor(private readonly db: Database) {
    this.db.run(SCHEMA);
  }

  async create(parcel: Parcel): Promise<void> {
    this.db
      .query('INSERT INTO parcels (parcel_id, recipient_pkh, delivery_secret) VALUES ($id, $recipientPkh, $secret)')
      .run({ $id: parcel.id, $recipientPkh: parcel.recipientPkh, $secret: parcel.deliverySecret });
    for (const hop of parcel.hops) await this.appendHop(parcel.id, hop);
  }

  async find(id: string): Promise<Parcel | null> {
    const row = this.db.query('SELECT * FROM parcels WHERE parcel_id = $id').get({ $id: id }) as
      | { parcel_id: string; recipient_pkh: string; delivery_secret: string }
      | null;
    if (!row) return null;

    const hops = this.db.query('SELECT txid, state, custodian FROM hops WHERE parcel_id = $id ORDER BY seq ASC').all({ $id: id }) as Array<CustodyHop>;
    return { id: row.parcel_id, recipientPkh: row.recipient_pkh, deliverySecret: row.delivery_secret, hops };
  }

  async appendHop(id: string, hop: CustodyHop): Promise<void> {
    this.db
      .query(
        `INSERT INTO hops (parcel_id, seq, txid, state, custodian)
         VALUES ($id, (SELECT COALESCE(MAX(seq), -1) + 1 FROM hops WHERE parcel_id = $id), $txid, $state, $custodian)`,
      )
      .run({ $id: id, $txid: hop.txid, $state: hop.state, $custodian: hop.custodian });
  }
}
