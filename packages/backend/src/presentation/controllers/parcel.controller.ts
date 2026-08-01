import { hexToBin } from '@bitauth/libauth';
import { AcceptHandoffUseCase, ConfirmDeliveryUseCase, ConfirmReturnUseCase, CreateParcelUseCase, HandoffUseCase, RejectDeliveryUseCase, RequestDeliveryUseCase, ReturnToSenderUseCase } from '../../application/use-cases/index.js';

export interface ParcelControllerDeps {
  createParcel: CreateParcelUseCase;
  handoff: HandoffUseCase;
  acceptHandoff: AcceptHandoffUseCase;
  requestDelivery: RequestDeliveryUseCase;
  confirmDelivery: ConfirmDeliveryUseCase;
  reject: RejectDeliveryUseCase;
  returnToSender: ReturnToSenderUseCase;
  confirmReturn: ConfirmReturnUseCase;
}

export class ParcelController {
  constructor(private readonly deps: ParcelControllerDeps) {}

  create(body: { merchantPk: string; recipientPkh: string; courierPkh: string }): Promise<{ contractId: string; address: string; txid: string }> {
    return this.deps.createParcel.execute({
      merchantPk: hexToBin(body.merchantPk),
      recipientPkh: hexToBin(body.recipientPkh),
      courierPkh: hexToBin(body.courierPkh),
    });
  }

  handoff(contractId: string, body: { courierSig: string; courierPk: string; nextCustodian: string }): Promise<string> {
    return this.deps.handoff.execute({
      contractId,
      courierSig: hexToBin(body.courierSig),
      courierPk: hexToBin(body.courierPk),
      nextCustodian: hexToBin(body.nextCustodian),
    });
  }

  acceptHandoff(contractId: string, body: { courierSig: string; courierPk: string }): Promise<string> {
    return this.deps.acceptHandoff.execute({
      contractId,
      courierSig: hexToBin(body.courierSig),
      courierPk: hexToBin(body.courierPk),
    });
  }

  requestDelivery(contractId: string, body: { courierSig: string; courierPk: string }): Promise<string> {
    return this.deps.requestDelivery.execute({
      contractId,
      courierSig: hexToBin(body.courierSig),
      courierPk: hexToBin(body.courierPk),
    });
  }

  confirmDelivery(contractId: string, body: { recipientSig: string; recipientPk: string }): Promise<string> {
    return this.deps.confirmDelivery.execute({
      contractId,
      recipientSig: hexToBin(body.recipientSig),
      recipientPk: hexToBin(body.recipientPk),
    });
  }

  reject(contractId: string, body: { recipientSig: string; recipientPk: string }): Promise<string> {
    return this.deps.reject.execute({
      contractId,
      recipientSig: hexToBin(body.recipientSig),
      recipientPk: hexToBin(body.recipientPk),
    });
  }

  returnToSender(contractId: string, body: { courierSig: string; courierPk: string }): Promise<string> {
    return this.deps.returnToSender.execute({
      contractId,
      courierSig: hexToBin(body.courierSig),
      courierPk: hexToBin(body.courierPk),
    });
  }

  confirmReturn(contractId: string, body: { merchantSig: string; merchantPk: string }): Promise<string> {
    return this.deps.confirmReturn.execute({
      contractId,
      merchantSig: hexToBin(body.merchantSig),
      merchantPk: hexToBin(body.merchantPk),
    });
  }
}
