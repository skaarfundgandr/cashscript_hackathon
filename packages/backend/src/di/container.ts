import { AcceptHandoffUseCase, ConfirmDeliveryUseCase, CreateParcelUseCase, GetParcelUseCase, HandoffUseCase, RequestDeliveryUseCase } from '../application/use-cases/index.js';
import { CashScriptParcelTracker } from '../infrastructure/cashscript/ParcelTracker.js';

const parcelTracker = new CashScriptParcelTracker();

export const container = {
  createParcel: new CreateParcelUseCase(parcelTracker),
  handoff: new HandoffUseCase(parcelTracker),
  acceptHandoff: new AcceptHandoffUseCase(parcelTracker),
  requestDelivery: new RequestDeliveryUseCase(parcelTracker),
  confirmDelivery: new ConfirmDeliveryUseCase(parcelTracker),
  getParcel: new GetParcelUseCase(parcelTracker),
};
