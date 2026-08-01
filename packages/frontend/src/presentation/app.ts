import type { IWalletConnector } from '../application/ports/wallet-connector.js';
import { addressToPkhHex } from '../application/utils/cashaddr.js';
import { ApiClient, type ParcelDto } from '../infrastructure/api-client.js';
import { MockWalletConnector } from '../infrastructure/mock-wallet.js';

const STATE_NAMES: Record<number, string> = {
  0: 'In Custody',
  1: 'Handoff Pending',
  2: 'Delivery Pending',
  3: 'Delivered',
  4: 'Rejected',
  5: 'Return Pending',
  6: 'Returned',
};

export class App {
  private readonly api: ApiClient;
  private readonly wallet: IWalletConnector;
  private readonly connectBtn: HTMLButtonElement;
  private readonly disconnectBtn: HTMLButtonElement;
  private readonly walletAddress: HTMLSpanElement;
  private readonly createForm: HTMLFormElement;
  private readonly recipientInput: HTMLInputElement;
  private readonly courierInput: HTMLInputElement;
  private readonly trackForm: HTMLFormElement;
  private readonly trackInput: HTMLInputElement;
  private readonly parcelSection: HTMLElement;
  private readonly parcelInfo: HTMLDListElement;
  private readonly handoffRow: HTMLDivElement;
  private readonly nextCustodianInput: HTMLInputElement;
  private readonly handoffBtn: HTMLButtonElement;
  private readonly acceptBtn: HTMLButtonElement;
  private readonly deliverBtn: HTMLButtonElement;
  private readonly confirmBtn: HTMLButtonElement;
  private readonly rejectBtn: HTMLButtonElement;
  private readonly returnBtn: HTMLButtonElement;
  private readonly confirmReturnBtn: HTMLButtonElement;
  private readonly messageSection: HTMLElement;
  private readonly message: HTMLParagraphElement;
  private address = '';
  private parcel: ParcelDto | null = null;

  constructor() {
    this.api = new ApiClient();
    this.wallet = new MockWalletConnector();
    this.connectBtn = this.required<HTMLButtonElement>('#connect-btn');
    this.disconnectBtn = this.required<HTMLButtonElement>('#disconnect-btn');
    this.walletAddress = this.required<HTMLSpanElement>('#wallet-address');
    this.createForm = this.required<HTMLFormElement>('#create-form');
    this.recipientInput = this.required<HTMLInputElement>('#recipient-address');
    this.courierInput = this.required<HTMLInputElement>('#courier-address');
    this.trackForm = this.required<HTMLFormElement>('#track-form');
    this.trackInput = this.required<HTMLInputElement>('#track-contract-id');
    this.parcelSection = this.required<HTMLElement>('#parcel-section');
    this.parcelInfo = this.required<HTMLDListElement>('#parcel-info');
    this.handoffRow = this.required<HTMLDivElement>('#handoff-row');
    this.nextCustodianInput = this.required<HTMLInputElement>('#next-custodian');
    this.handoffBtn = this.required<HTMLButtonElement>('#btn-handoff');
    this.acceptBtn = this.required<HTMLButtonElement>('#btn-accept');
    this.deliverBtn = this.required<HTMLButtonElement>('#btn-deliver');
    this.confirmBtn = this.required<HTMLButtonElement>('#btn-confirm');
    this.rejectBtn = this.required<HTMLButtonElement>('#btn-reject');
    this.returnBtn = this.required<HTMLButtonElement>('#btn-return');
    this.confirmReturnBtn = this.required<HTMLButtonElement>('#btn-confirm-return');
    this.messageSection = this.required<HTMLElement>('#message-section');
    this.message = this.required<HTMLParagraphElement>('#message');
  }

  init(): void {
    this.bindEvents();
  }

  private required<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing element: ${selector}`);
    }
    return element;
  }

  private bindEvents(): void {
    this.connectBtn.addEventListener('click', () => {
      void this.handleConnect();
    });
    this.disconnectBtn.addEventListener('click', () => {
      void this.handleDisconnect();
    });
    this.createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.handleCreate();
    });
    this.trackForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.handleTrack();
    });
    this.handoffBtn.addEventListener('click', () => {
      void this.handleHandoff();
    });
    this.acceptBtn.addEventListener('click', () => {
      void this.handleAccept();
    });
    this.deliverBtn.addEventListener('click', () => {
      void this.handleDeliver();
    });
    this.confirmBtn.addEventListener('click', () => {
      void this.handleConfirm();
    });
    this.rejectBtn.addEventListener('click', () => {
      void this.handleReject();
    });
    this.returnBtn.addEventListener('click', () => {
      void this.handleReturn();
    });
    this.confirmReturnBtn.addEventListener('click', () => {
      void this.handleConfirmReturn();
    });
  }

  private async handleConnect(): Promise<void> {
    try {
      this.setMessage('Connecting wallet...');
      this.address = await this.wallet.connect();
      await this.authenticate();
      this.walletAddress.textContent = this.address;
      this.walletAddress.classList.remove('muted');
      this.connectBtn.hidden = true;
      this.disconnectBtn.hidden = false;
      this.setMessage('Wallet connected');
    } catch (error) {
      this.setMessage(this.errorText(error), true);
    }
  }

  private async authenticate(): Promise<void> {
    const challenge = await this.api.getChallenge(this.address);
    const signature = await this.wallet.signMessage(challenge.nonce);
    const auth = await this.api.verifyAuth(this.address, challenge.nonce, signature);
    this.api.setToken(auth.token);
  }

  private async handleDisconnect(): Promise<void> {
    try {
      await this.wallet.disconnect();
      this.api.clearToken();
      this.address = '';
      this.walletAddress.textContent = 'Not connected';
      this.walletAddress.classList.add('muted');
      this.connectBtn.hidden = false;
      this.disconnectBtn.hidden = true;
      this.setMessage('Wallet disconnected');
    } catch (error) {
      this.setMessage(this.errorText(error), true);
    }
  }

  private async handleCreate(): Promise<void> {
    try {
      if (!this.address) {
        throw new Error('Connect a wallet first');
      }
      const recipientPkh = addressToPkhHex(this.recipientInput.value.trim());
      const courierPkh = addressToPkhHex(this.courierInput.value.trim());
      const merchantPk = await this.wallet.getPublicKey();
      this.setMessage('Creating parcel...');
      this.parcel = await this.api.createParcel(merchantPk, recipientPkh, courierPkh);
      this.trackInput.value = this.parcel.contractId;
      this.renderParcel();
      this.setMessage('Parcel created');
    } catch (error) {
      this.setMessage(this.errorText(error), true);
    }
  }

  private async handleTrack(): Promise<void> {
    const contractId = this.trackInput.value.trim();
    if (!contractId) {
      return;
    }
    try {
      this.setMessage('Fetching parcel...');
      this.parcel = await this.api.getParcel(contractId);
      this.renderParcel();
      this.setMessage('Parcel loaded');
    } catch (error) {
      this.setMessage(this.errorText(error), true);
    }
  }

  private handleHandoff(): Promise<void> {
    const parcel = this.parcel;
    if (!parcel) {
      return Promise.resolve();
    }
    const nextCustodian = addressToPkhHex(this.nextCustodianInput.value.trim());
    return this.runAction('handoff', (sig, pk) =>
      this.api.handoff(parcel.contractId, sig, pk, nextCustodian),
    );
  }

  private handleAccept(): Promise<void> {
    const parcel = this.parcel;
    if (!parcel) {
      return Promise.resolve();
    }
    return this.runAction('accept-handoff', (sig, pk) =>
      this.api.acceptHandoff(parcel.contractId, sig, pk),
    );
  }

  private handleDeliver(): Promise<void> {
    const parcel = this.parcel;
    if (!parcel) {
      return Promise.resolve();
    }
    return this.runAction('request-delivery', (sig, pk) =>
      this.api.requestDelivery(parcel.contractId, sig, pk),
    );
  }

  private handleConfirm(): Promise<void> {
    const parcel = this.parcel;
    if (!parcel) {
      return Promise.resolve();
    }
    return this.runAction('confirm-delivery', (sig, pk) =>
      this.api.confirmDelivery(parcel.contractId, sig, pk),
    );
  }

  private handleReject(): Promise<void> {
    const parcel = this.parcel;
    if (!parcel) {
      return Promise.resolve();
    }
    return this.runAction('reject-delivery', (sig, pk) =>
      this.api.rejectDelivery(parcel.contractId, sig, pk),
    );
  }

  private handleReturn(): Promise<void> {
    const parcel = this.parcel;
    if (!parcel) {
      return Promise.resolve();
    }
    return this.runAction('return-to-sender', (sig, pk) =>
      this.api.returnToSender(parcel.contractId, sig, pk),
    );
  }

  private handleConfirmReturn(): Promise<void> {
    const parcel = this.parcel;
    if (!parcel) {
      return Promise.resolve();
    }
    return this.runAction('confirm-return', (sig, pk) =>
      this.api.confirmReturn(parcel.contractId, sig, pk),
    );
  }

  private async runAction(
    kind: string,
    call: (sig: string, pk: string) => Promise<ParcelDto>,
  ): Promise<void> {
    try {
      const sig = await this.wallet.signMessage(`${kind}:${this.parcel!.contractId}`);
      const pk = await this.wallet.getPublicKey();
      this.setMessage(`Executing ${kind}...`);
      this.parcel = await call(sig, pk);
      this.renderParcel();
      this.setMessage(`${kind} succeeded`);
    } catch (error) {
      this.setMessage(this.errorText(error), true);
    }
  }

  private renderParcel(): void {
    const parcel = this.parcel;
    if (!parcel) {
      return;
    }
    this.parcelSection.hidden = false;
    this.parcelInfo.replaceChildren();
    const rows: Array<[string, string]> = [
      ['Contract ID', parcel.contractId],
      ['State', `${parcel.state} - ${STATE_NAMES[parcel.state] ?? 'Unknown'}`],
      ['Custodian', parcel.custodian || '-'],
      ['Recipient', parcel.recipientPkh],
      ['Merchant', parcel.merchantPkh],
    ];
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      this.parcelInfo.append(dt, dd);
    }
    this.updateActions(parcel.state);
  }

  private updateActions(state: number): void {
    this.handoffRow.hidden = state !== 0;
    this.acceptBtn.hidden = state !== 1;
    this.deliverBtn.hidden = state !== 0;
    this.confirmBtn.hidden = state !== 2;
    this.rejectBtn.hidden = state !== 2;
    this.returnBtn.hidden = state !== 2;
    this.confirmReturnBtn.hidden = state !== 5;
  }

  private setMessage(text: string, isError = false): void {
    this.message.textContent = text;
    this.message.classList.toggle('error', isError);
    this.message.classList.toggle('ok', !isError);
    this.messageSection.hidden = false;
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
