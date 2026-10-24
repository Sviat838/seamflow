// Test-only fake of the Supabase admin client, shared by the engagement modules' tests (appeals,
// leads, feed, audit, retention). Records every query-builder call and lets the test decide the result.
import { vi } from "vitest";
import type { AdminClient } from "@/lib/supabase/admin";

export interface RecordedQuery {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  /** Columns from select(), including the returning select() after insert/update. */
  columns?: string;
  /** Every other chained call, in order: ["eq", "id", "…"], ["order", "id", { ascending: true }], … */
  calls: [string, ...unknown[]][];
  terminal?: "single" | "maybeSingle" | "many";
}

export interface QueryResult {
  data: unknown;
  error: unknown;
}

export type QueryHandler = (query: RecordedQuery) => QueryResult | Promise<QueryResult>;

/** The value a query was filtered on, e.g. filterValue(q, "eq", "id"). */
export function filterValue(query: RecordedQuery, method: string, column: string): unknown {
  return query.calls.find(([name, col]) => name === method && col === column)?.[2];
}

export function createFakeAdmin(handler: QueryHandler = () => ({ data: null, error: null })) {
  const queries: RecordedQuery[] = [];
  const rpc = vi.fn<(fn: string, args?: unknown) => QueryResult | Promise<QueryResult>>(() => ({
    data: [],
    error: null,
  }));
  const storage = {
    download: vi.fn<(path: string) => Promise<QueryResult>>(async () => ({
      data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])]),
      error: null,
    })),
    remove: vi.fn<(paths: string[]) => Promise<QueryResult>>(async (paths) => ({
      data: paths.map((name) => ({ name })),
      error: null,
    })),
  };

  function builder(query: RecordedQuery): unknown {
    queries.push(query);
    const run = (terminal: RecordedQuery["terminal"]) => {
      query.terminal = terminal;
      return Promise.resolve().then(() => handler(query));
    };
    // Any filter/modifier is recorded and chains; awaiting the builder runs it, like PostgREST's.
    const chain: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop === "symbol") return undefined;
          if (prop === "then") {
            return (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
              run("many").then(resolve, reject);
          }
          if (prop === "single" || prop === "maybeSingle") return () => run(prop);
          if (prop === "select") {
            return (columns = "*") => {
              query.columns = columns;
              return chain;
            };
          }
          return (...args: unknown[]) => {
            query.calls.push([prop, ...args]);
            return chain;
          };
        },
      },
    );
    return chain;
  }

  const client = {
    from: (table: string) => ({
      select: (columns = "*") => builder({ table, op: "select", columns, calls: [] }),
      insert: (payload: unknown) => builder({ table, op: "insert", payload, calls: [] }),
      update: (payload: unknown) => builder({ table, op: "update", payload, calls: [] }),
      delete: () => builder({ table, op: "delete", calls: [] }),
    }),
    storage: { from: vi.fn(() => storage) },
    // Awaitable directly or after .abortSignal(), like PostgREST's builder.
    rpc: (fn: string, args?: unknown) => {
      const result = Promise.resolve().then(() => rpc(fn, args));
      return Object.assign(result, { abortSignal: () => result });
    },
  };

  return { client: client as unknown as AdminClient, queries, rpc, storage };
}
