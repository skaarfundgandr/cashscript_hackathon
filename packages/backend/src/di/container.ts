import { Database } from 'bun:sqlite';
import { AcceptHandoffUseCase, ConfirmDeliveryUseCase, CreateParcelUseCase, GetParcelUseCase, HandoffUseCase, RequestDeliveryUseCase } from '../application/use-cases/index.js';
import { CashScriptParcelTracker } from '../infrastructure/cashscript/ParcelTracker.js';
import { SqliteContractStore } from '../infrastructure/memory/sqlite-contract-store.js';

const db = new Database('parcel-tracker.db');
const store = new SqliteContractStore(db);
const parcelTracker = new CashScriptParcelTracker(undefined, store);

export const container = {
  createParcel: new CreateParcelUseCase(parcelTracker),
  handoff: new HandoffUseCase(parcelTracker),
  acceptHandoff: new AcceptHandoffUseCase(parcelTracker),
  requestDelivery: new RequestDeliveryUseCase(parcelTracker),
  confirmDelivery: new ConfirmDeliveryUseCase(parcelTracker),
  getParcel: new GetParcelUseCase(parcelTracker),
};
