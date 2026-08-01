/**
 * The status carries the meaning; the message is for a human reading a log or a curl.
 * `presentation/routes.ts` maps these onto the response — nothing else in the app touches status.
 */
export class ShopError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 404 — unknown product or order. */
export class NotFoundError extends ShopError {
  constructor(message: string) {
    super(404, message);
  }
}

/** 403 — accessToken mismatch. The secret is not read. */
export class ForbiddenError extends ShopError {
  constructor(message: string) {
    super(403, message);
  }
}

/** 409 — the order is not in a state the operation can act on. */
export class ConflictError extends ShopError {
  constructor(message: string) {
    super(409, message);
  }
}

/** 502 — the custody gateway failed on a call that requires it. Never GET /shop/orders/:id. */
export class CustodyUnavailableError extends ShopError {
  constructor(message: string) {
    super(502, message);
  }
}
