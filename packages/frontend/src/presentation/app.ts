import { ApiClient, type ParcelDto } from '../infrastructure/api-client.js';

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
  private readonly trackForm: HTMLFormElement;
  private readonly trackInput: HTMLInputElement;
  private readonly parcelSection: HTMLElement;
  private readonly parcelInfo: HTMLDListElement;
  private readonly messageSection: HTMLElement;
  private readonly message: HTMLParagraphElement;
  private parcel: ParcelDto | null = null;

  constructor() {
    this.api = new ApiClient();
    this.trackForm = this.required<HTMLFormElement>('#track-form');
    this.trackInput = this.required<HTMLInputElement>('#track-contract-id');
    this.parcelSection = this.required<HTMLElement>('#parcel-section');
    this.parcelInfo = this.required<HTMLDListElement>('#parcel-info');
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
    this.trackForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.handleTrack();
    });
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
