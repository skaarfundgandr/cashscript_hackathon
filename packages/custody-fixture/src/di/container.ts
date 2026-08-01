import { Database } from 'bun:sqlite';
import { AcceptHandoffUseCase, B1Mode, ConfirmDeliveryUseCase, CreateParcelUseCase, GetParcelUseCase, HandoffUseCase, RequestDeliveryUseCase } from '../application/use-cases/index.js';
import { SqliteCourierKeys } from '../infrastructure/keys.js';
import { SqliteParcelStore } from '../infrastructure/sqlite/parcel-store.js';

export const FIXTURE_DB = process.env.FIXTURE_DB ?? '.custody-fixture.db';
export const B1: B1Mode = process.env.B1 === 'throw' ? 'throw' : 'serve';

const db = new Database(FIXTURE_DB, { create: true });
// Wait for the lock instead of dying on it: under `--watch`, the restarting process races the
// dying one for the file. A hard SQLITE_BUSY here would kill the fixture on every save.
db.run('PRAGMA busy_timeout = 5000');
db.run('PRAGMA journal_mode = WAL');

const parcels = new SqliteParcelStore(db);
const couriers = new SqliteCourierKeys(db);

export const container = {
  createParcel: new CreateParcelUseCase(parcels, couriers),
  handoff: new HandoffUseCase(parcels, couriers),
  acceptHandoff: new AcceptHandoffUseCase(parcels, couriers),
  requestDelivery: new RequestDeliveryUseCase(parcels, couriers),
  confirmDelivery: new ConfirmDeliveryUseCase(parcels),
  getParcel: new GetParcelUseCase(parcels, B1),
};
