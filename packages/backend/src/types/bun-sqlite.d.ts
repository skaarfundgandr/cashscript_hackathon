declare module 'bun:sqlite' {
  export class Database {
    constructor(filename: string);
    run(sql: string, params?: Record<string, unknown>): void;
    query(sql: string): Statement;
  }

  export interface Statement {
    run(params?: Record<string, unknown>): void;
    get(params?: Record<string, unknown>): unknown;
    all(params?: Record<string, unknown>): unknown[];
  }
}
