import { Database } from 'bun:sqlite';
import { CustodyAttachment, OrderRepository } from '../../application/ports/index.js';
import { Order } from '../../domain/index.js';

interface OrderRow {
  order_id: string;
  access_token: string;
  product_id: string;
  buyer_id: string;
  courier_id: string;
  parcel_id: string | null;
  contract_address: string | null;
  mint_txid: string | null;
  delivery_secret: string;
  revealed_at: number | null;
  created_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  order_id          TEXT PRIMARY KEY,
  access_token      TEXT NOT NULL,
  product_id        TEXT NOT NULL,
  buyer_id          TEXT NOT NULL,
  courier_id        TEXT NOT NULL,
  parcel_id         TEXT,
  contract_address  TEXT,
  mint_txid         TEXT,
  delivery_secret   TEXT NOT NULL,
  revealed_at       INTEGER,
  created_at        INTEGER NOT NULL
)`;

/**
 * bun:sqlite — zero install, and it survives `--watch` restarts and reboots mid-recording.
 * The port is async so the store stays swappable; these calls are synchronous underneath.
 */
export class SqliteOrderRepository implements OrderRepository {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    // Wait for the lock instead of dying on it: under `--watch`, the restarting process races the
    // dying one for the file. A hard SQLITE_BUSY here would kill the shop on every save.
    this.db.run('PRAGMA busy_timeout = 5000');
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run(SCHEMA);
  }

  async save(order: Order): Promise<void> {
    this.db
      .query(
        `INSERT INTO orders (order_id, access_token, product_id, buyer_id, courier_id, parcel_id, contract_address, mint_txid, delivery_secret, revealed_at, created_at)
         VALUES ($orderId, $accessToken, $productId, $buyerId, $courierId, $parcelId, $contractAddress, $mintTxid, $deliverySecret, $revealedAt, $createdAt)`,
      )
      .run({
        $orderId: order.orderId,
        $accessToken: order.accessToken,
        $productId: order.productId,
        $buyerId: order.buyerId,
        $courierId: order.courierId,
        $parcelId: order.parcelId,
        $contractAddress: order.contractAddress,
        $mintTxid: order.mintTxid,
        $deliverySecret: order.deliverySecret,
        $revealedAt: order.revealedAt,
        $createdAt: order.createdAt,
      });
  }

  async findById(orderId: string): Promise<Order | null> {
    const row = this.db.query('SELECT * FROM orders WHERE order_id = $orderId').get({ $orderId: orderId }) as OrderRow | null;
    return row ? toOrder(row) : null;
  }

  async exists(orderId: string): Promise<boolean> {
    const row = this.db.query('SELECT 1 FROM orders WHERE order_id = $orderId').get({ $orderId: orderId });
    return row !== null;
  }

  async attachCustody(orderId: string, custody: CustodyAttachment): Promise<void> {
    this.db
      .query(
        `UPDATE orders
            SET parcel_id = $parcelId, contract_address = $contractAddress, mint_txid = $mintTxid, delivery_secret = $deliverySecret
          WHERE order_id = $orderId`,
      )
      .run({
        $orderId: orderId,
        $parcelId: custody.parcelId,
        $contractAddress: custody.contractAddress,
        $mintTxid: custody.mintTxid,
        $deliverySecret: custody.deliverySecret,
      });
  }

  async markRevealed(orderId: string, revealedAt: number): Promise<void> {
    // `revealed_at IS NULL` keeps the stamp write-once even if two reveals race.
    this.db
      .query('UPDATE orders SET revealed_at = $revealedAt WHERE order_id = $orderId AND revealed_at IS NULL')
      .run({ $orderId: orderId, $revealedAt: revealedAt });
  }
}

function toOrder(row: OrderRow): Order {
  return {
    orderId: row.order_id,
    accessToken: row.access_token,
    productId: row.product_id,
    buyerId: row.buyer_id,
    courierId: row.courier_id,
    parcelId: row.parcel_id,
    contractAddress: row.contract_address,
    mintTxid: row.mint_txid,
    deliverySecret: row.delivery_secret,
    revealedAt: row.revealed_at,
    createdAt: row.created_at,
  };
}
