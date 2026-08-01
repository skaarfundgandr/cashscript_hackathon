import { AcceptHandoffUseCase, ConfirmDeliveryUseCase, ConfirmReturnUseCase, CreateParcelUseCase, HandoffUseCase, RejectDeliveryUseCase, RequestDeliveryUseCase, ReturnToSenderUseCase } from '../application/use-cases/index.js';
import { CashScriptParcelTracker } from '../infrastructure/cashscript/ParcelTracker.js';
import { LibauthAuthService } from '../infrastructure/libauth/auth-service.js';
import { LibauthKeyStore } from '../infrastructure/libauth/key-store.js';

const parcelTracker = new CashScriptParcelTracker();
const keyStore = new LibauthKeyStore();
const authService = new LibauthAuthService();

export const container = {
  createParcel: new CreateParcelUseCase(parcelTracker),
  handoff: new HandoffUseCase(parcelTracker),
  acceptHandoff: new AcceptHandoffUseCase(parcelTracker),
  requestDelivery: new RequestDeliveryUseCase(parcelTracker),
  confirmDelivery: new ConfirmDeliveryUseCase(parcelTracker),
  reject: new RejectDeliveryUseCase(parcelTracker),
  returnToSender: new ReturnToSenderUseCase(parcelTracker),
  confirmReturn: new ConfirmReturnUseCase(parcelTracker),
  auth: authService,
  keyStore,
};
