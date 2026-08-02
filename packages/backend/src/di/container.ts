import { Database } from 'bun:sqlite';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import { AcceptHandoffUseCase, ConfirmDeliveryUseCase, CreateParcelUseCase, GetParcelUseCase, HandoffUseCase, RequestDeliveryUseCase } from '../application/use-cases/index.js';
import { CashScriptParcelTracker } from '../infrastructure/cashscript/ParcelTracker.js';
import { SqliteContractStore } from '../infrastructure/memory/sqlite-contract-store.js';

const db = new Database('parcel-tracker.db');
const store = new SqliteContractStore(db);

// One persistent Electrum connection for the life of the process. The provider's default
// lifecycle opens and closes the WebSocket around every request, and the history walk in
// getParcelHistory awaits its requests one at a time — so every hop paid a full TLS+WS
// handshake to the public chipnet server (measured at 4-6s per call, ~28s per chain read).
const provider = new ElectrumNetworkProvider(Network.CHIPNET, { manualConnectionManagement: true });
await provider.connect();

const parcelTracker = new CashScriptParcelTracker(provider, store);

export const container = {
  createParcel: new CreateParcelUseCase(parcelTracker),
  handoff: new HandoffUseCase(parcelTracker),
  acceptHandoff: new AcceptHandoffUseCase(parcelTracker),
  requestDelivery: new RequestDeliveryUseCase(parcelTracker),
  confirmDelivery: new ConfirmDeliveryUseCase(parcelTracker),
  getParcel: new GetParcelUseCase(parcelTracker),
};
