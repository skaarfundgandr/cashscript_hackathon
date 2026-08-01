# Worldwide Delivery Tracking — Proposed Flow

## Goal

Build a shared, tamper-resistant tracking system for individual e-commerce parcels, similar to Shopee, Lazada, or Amazon delivery tracking. It records custody handoffs and gives the final recipient authority to confirm successful delivery.

## Actors

- **Merchant / Seller**: creates the parcel record, mints its unique tracking token, and assigns the first courier.
- **Courier A**: first custodian of the parcel.
- **Courier B**: next/final courier in the demo.
- **Recipient**: the customer who ordered the parcel; has the final say on delivery confirmation.

## Core Model

Each physical parcel has one unique CashToken and one CashScript state machine. The contract contains:

- Parcel tracking ID/token
- Current delivery status
- Current or expected custodian

There is one active contract state at a time. Every completed action spends the old state and creates the next state, preserving an immutable on-chain history.

## Successful Delivery Flow

```text
Merchant creates parcel
  - mints one unique parcel token
  - assigns Courier A as first custodian
        |
        v
Courier A creates handoff for Courier B
  - QR code represents the intended handoff
        |
        v
Courier B scans the QR and approves with their wallet
  - custody moves to Courier B
        |
        v
Courier B creates delivery request for Recipient
  - QR code represents the final delivery request
        |
        v
Recipient scans the QR and approves with their wallet
  - delivery status becomes Delivered
  - no further custody transition is permitted
```

## State Machine

```text
Created
  -> In custody: Courier A
  -> Handoff pending: Courier B
  -> In custody: Courier B
  -> Delivery pending: Recipient
  -> Delivered (terminal)
```

Only valid state transitions are accepted by the CashScript contract. A receiver must approve a QR-code handoff with their wallet before custody advances.

## Final Delivery Rule

The recipient is the only party that can transition the parcel from `Delivery pending` to `Delivered`.

- A courier cannot mark a parcel delivered on its own.
- The recipient’s wallet signature is the proof of acceptance.
- Once marked `Delivered`, the custody chain is closed permanently.

## QR-Code Rule

A QR code carries the handoff or delivery request. It does not prove the event by itself. The receiving courier or recipient must scan it and approve the corresponding transaction using their wallet signature.

## Hackathon Scope

- Demonstrate one individual parcel.
- Demonstrate Merchant -> Courier A -> Courier B -> Recipient.
- Focus on successful delivery only; exception handling such as returns or unresponsive recipients is out of scope for the first demo.
