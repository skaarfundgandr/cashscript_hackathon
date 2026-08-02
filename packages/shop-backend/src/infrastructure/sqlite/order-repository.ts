import { Database } from 'bun:sqlite';
import { CustodyAttachment, OrderRepository } from '../../application/ports/index.js';
import { Order, OrderStatus } from '../../domain/index.js';
import { BUYER, COURIERS, MERCHANT } from '../seed.js';

const UNASSIGNED_COURIER_ID = '';

interface OrderRow {
  order_id: string;
  access_token: string;
  product_id: string;
  buyer_id: string;
  merchant_id: string;
  courier_id: string;
  status: OrderStatus;
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
  merchant_id       TEXT NOT NULL,
  courier_id        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'approved',
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
    this.db.run('PRAGMA foreign_keys = ON');
    this.db.run(SCHEMA);
    this.seedIdentities();
    this.migrateStatusColumn();
    this.migrateIdentityIds();
  }

  async save(order: Order): Promise<void> {
    this.db
      .query(
        `INSERT INTO orders (order_id, access_token, product_id, buyer_id, merchant_id, courier_id, status, parcel_id, contract_address, mint_txid, delivery_secret, revealed_at, created_at)
         VALUES ($orderId, $accessToken, $productId, $buyerId, $merchantId, $courierId, $status, $parcelId, $contractAddress, $mintTxid, $deliverySecret, $revealedAt, $createdAt)`,
      )
      .run({
        $orderId: order.orderId,
        $accessToken: order.accessToken,
        $productId: order.productId,
        $buyerId: order.buyerId,
        $merchantId: order.merchantId,
        $courierId: order.courierId ?? UNASSIGNED_COURIER_ID,
        $status: order.status,
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

  async findPending(): Promise<Array<Order>> {
    const rows = this.db.query("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at ASC").all() as Array<OrderRow>;
    return rows.map(toOrder);
  }

  async listWithParcels(): Promise<Array<Order>> {
    const rows = this.db
      .query('SELECT * FROM orders WHERE parcel_id IS NOT NULL ORDER BY created_at DESC')
      .all() as Array<OrderRow>;
    return rows.map(toOrder);
  }

  async exists(orderId: string): Promise<boolean> {
    const row = this.db.query('SELECT 1 FROM orders WHERE order_id = $orderId').get({ $orderId: orderId });
    return row !== null;
  }

  async transitionStatus(orderId: string, from: OrderStatus, to: OrderStatus): Promise<boolean> {
    const result = this.db.query('UPDATE orders SET status = $to WHERE order_id = $orderId AND status = $from').run({ $orderId: orderId, $from: from, $to: to });
    return result.changes === 1;
  }

  async assignCourier(orderId: string, courierId: string | null): Promise<void> {
    this.db.query('UPDATE orders SET courier_id = $courierId WHERE order_id = $orderId').run({
      $orderId: orderId,
      $courierId: courierId ?? UNASSIGNED_COURIER_ID,
    });
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

  private migrateStatusColumn(): void {
    const columns = this.db.query('PRAGMA table_info(orders)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'status')) {
      // Existing orders were created under the auto-mint workflow, so preserve them as approved.
      this.db.run("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
    }
  }

  private seedIdentities(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS identities (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('buyer', 'merchant', 'courier')),
      name TEXT NOT NULL,
      address TEXT,
      company TEXT,
      pkh TEXT
    )`);
    const insert = this.db.query('INSERT OR IGNORE INTO identities (id, role, name, address, company, pkh) VALUES ($id, $role, $name, $address, $company, $pkh)');
    insert.run({ $id: MERCHANT.id, $role: 'merchant', $name: MERCHANT.name, $address: null, $company: null, $pkh: null });
    insert.run({ $id: BUYER.id, $role: 'buyer', $name: BUYER.name, $address: BUYER.address, $company: null, $pkh: BUYER.pkh });
    for (const courier of COURIERS) insert.run({ $id: courier.id, $role: 'courier', $name: courier.name, $address: null, $company: courier.company, $pkh: courier.pkh });
  }

  private migrateIdentityIds(): void {
    const columns = this.db.query('PRAGMA table_info(orders)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'merchant_id')) {
      this.db.run(`ALTER TABLE orders ADD COLUMN merchant_id TEXT NOT NULL DEFAULT '${MERCHANT.id}'`);
    }
    this.db.query("UPDATE orders SET buyer_id = $buyerId WHERE buyer_id = 'buyer-ana'").run({ $buyerId: BUYER.id });
    this.db.query("UPDATE orders SET courier_id = $courierId WHERE courier_id = 'jnt-mgl'").run({ $courierId: COURIERS[0]!.id });
    this.db.query("UPDATE orders SET courier_id = $courierId WHERE courier_id = 'ninjavan-rey'").run({ $courierId: COURIERS[1]!.id });
    this.db.query('UPDATE orders SET merchant_id = $merchantId WHERE merchant_id IS NULL OR merchant_id = \'\'').run({ $merchantId: MERCHANT.id });
  }
}

function toOrder(row: OrderRow): Order {
  return {
    orderId: row.order_id,
    accessToken: row.access_token,
    productId: row.product_id,
    buyerId: row.buyer_id,
    merchantId: row.merchant_id,
    courierId: row.courier_id || null,
    status: row.status,
    parcelId: row.parcel_id,
    contractAddress: row.contract_address,
    mintTxid: row.mint_txid,
    deliverySecret: row.delivery_secret,
    revealedAt: row.revealed_at,
    createdAt: row.created_at,
  };
}
