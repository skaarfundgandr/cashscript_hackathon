import { binToHex, hexToBin } from '@bitauth/libauth';
import { AcceptHandoffUseCase, ConfirmDeliveryUseCase, CreateParcelUseCase, GetParcelUseCase, HandoffUseCase, RequestDeliveryUseCase } from '../../application/use-cases/index.js';
import type { ParcelHistoryEntry } from '../../application/ports/parcel-contract.js';
import { createDeliverySecret } from '../../infrastructure/delivery-secret-service.js';
import { getCourier, MERCHANT, RECIPIENT } from '../../infrastructure/fixtures.js';
import { signRegistryAttestation } from '../../infrastructure/libauth/registry-attestation.js';

export interface ParcelControllerDeps {
  createParcel: CreateParcelUseCase;
  handoff: HandoffUseCase;
  acceptHandoff: AcceptHandoffUseCase;
  requestDelivery: RequestDeliveryUseCase;
  confirmDelivery: ConfirmDeliveryUseCase;
  getParcel: GetParcelUseCase;
}

export class ParcelController {
  constructor(private readonly deps: ParcelControllerDeps) {}

  async create(body: { courierId: string; recipientPkh?: string }): Promise<{ contractId: string; address: string; txid: string; deliverySecret: string }> {
    const courier = getCourier(body.courierId);
    const { hash, secret } = createDeliverySecret();
    const result = await this.deps.createParcel.execute({
      merchantPk: MERCHANT.privateKey,
      recipientPkh: body.recipientPkh ? hexToBin(body.recipientPkh) : RECIPIENT.publicKeyHash,
      courierPkh: courier.publicKeyHash,
      deliveryCodeHash: hash,
    });
    return { ...result, deliverySecret: binToHex(secret) };
  }

  handoff(contractId: string, body: { courierId: string; nextCourierId: string }): Promise<string> {
    const courier = getCourier(body.courierId);
    const nextCourier = getCourier(body.nextCourierId);
    return this.deps.handoff.execute({
      contractId,
      courierSig: courier.privateKey,
      courierPk: courier.publicKey,
      nextCustodian: nextCourier.publicKeyHash,
      registryAttestation: signRegistryAttestation(nextCourier.publicKeyHash),
    });
  }

  acceptHandoff(contractId: string, body: { courierId: string }): Promise<string> {
    const courier = getCourier(body.courierId);
    return this.deps.acceptHandoff.execute({
      contractId,
      courierSig: courier.privateKey,
      courierPk: courier.publicKey,
    });
  }

  requestDelivery(contractId: string, body: { courierId: string }): Promise<string> {
    const courier = getCourier(body.courierId);
    return this.deps.requestDelivery.execute({
      contractId,
      courierSig: courier.privateKey,
      courierPk: courier.publicKey,
    });
  }

  confirmDelivery(contractId: string, body: { courierId: string; deliveryCode: string }): Promise<string> {
    const courier = getCourier(body.courierId);
    return this.deps.confirmDelivery.execute({
      contractId,
      recipientSig: RECIPIENT.privateKey,
      recipientPk: RECIPIENT.publicKey,
      deliveryCode: hexToBin(body.deliveryCode),
    });
  }

  getParcel(contractId: string): Promise<Array<ParcelHistoryEntry>> {
    return this.deps.getParcel.execute(contractId);
  }
}
