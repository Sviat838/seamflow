// Test-only fake of the Supabase admin client: records every query and lets a test decide the result.
import { vi } from "vitest";
import type { AdminClient } from "@/lib/supabase/admin";
import type { CompanyRecord } from "./mappers";

export interface RecordedQuery {
  op: "select" | "insert" | "update" | "upsert" | "delete";
  table: string;
  columns?: string;
  payload?: unknown;
  options?: unknown;
  filters: [string, ...unknown[]][];
  terminal?: "single" | "maybeSingle" | "many";
}

export interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

export type QueryHandler = (query: RecordedQuery) => QueryResult | Promise<QueryResult>;

export function createFakeAdmin(handler: QueryHandler = () => ({ data: null, error: null })) {
  const queries: RecordedQuery[] = [];
  const rpc = vi.fn<(fn: string, args?: unknown) => Promise<QueryResult>>(async () => ({ data: [], error: null }));
  const getUserById = vi.fn<(id: string) => Promise<QueryResult>>(async (id) => ({
    data: { user: { id, email: "dana@gmail.com", email_confirmed_at: "2026-10-24T09:00:00Z" } },
    error: null,
  }));

  function builder(query: RecordedQuery) {
    queries.push(query);
    const run = (terminal: RecordedQuery["terminal"]) => {
      query.terminal = terminal;
      return Promise.resolve(handler(query));
    };
    const chain: Record<string, unknown> = {};
    for (const name of ["eq", "is", "in", "like", "order", "limit"]) {
      chain[name] = (...args: unknown[]) => {
        query.filters.push([name, ...args]);
        return chain;
      };
    }
    chain.select = (columns: string, options?: unknown) => {
      query.columns = columns;
      if (options) query.options = options;
      return chain;
    };
    chain.single = () => run("single");
    chain.maybeSingle = () => run("maybeSingle");
    chain.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      run("many").then(resolve, reject);
    return chain;
  }

  const client = {
    from: (table: string) => ({
      select: (columns: string, options?: unknown) => builder({ op: "select", table, columns, options, filters: [] }),
      insert: (payload: unknown) => builder({ op: "insert", table, payload, filters: [] }),
      update: (payload: unknown) => builder({ op: "update", table, payload, filters: [] }),
      upsert: (payload: unknown, options?: unknown) => builder({ op: "upsert", table, payload, options, filters: [] }),
      delete: () => builder({ op: "delete", table, filters: [] }),
    }),
    rpc: (fn: string, args?: unknown) => {
      const result = rpc(fn, args);
      return Object.assign(result, { abortSignal: () => result });
    },
    auth: { admin: { getUserById } },
  };

  return { client: client as unknown as AdminClient, queries, rpc, getUserById };
}

/** Value of the first `filter` (eq, is, ...) on `column`, if any. */
export function filterValue(query: RecordedQuery, filter: string, column: string): unknown {
  return query.filters.find(([name, col]) => name === filter && col === column)?.[2];
}

export const USER_ID = "0b6a1f3e-8c2d-4e5f-9a7b-1c2d3e4f5a6b";
export const OTHER_USER_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
export const COMPANY_ID = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";

export function companyRecord(overrides: Partial<CompanyRecord> = {}): CompanyRecord {
  return { id: COMPANY_ID, name: "Ballpark Holdings", slug: "ballpark-holdings", plan: "free", is_listed: true, ...overrides };
}

/** A PostgREST unique-violation error for the given constraint or unique index. */
export function uniqueViolation(constraint: string) {
  return {
    code: "23505",
    message: `duplicate key value violates unique constraint "${constraint}"`,
    details: null,
    hint: null,
  };
}
