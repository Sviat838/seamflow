// Test-only fake of the Supabase admin client: records every query and lets a test decide the result.
import { vi } from "vitest";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { ScanRecord } from "./mappers";

type CertificateRow = Database["public"]["Tables"]["certificates"]["Row"];

export interface RecordedQuery {
  op: "select" | "insert" | "update" | "delete";
  table: string;
  columns?: string;
  /** select() options, e.g. { count: "exact", head: true } for counts. */
  options?: unknown;
  payload?: unknown;
  filters: [string, ...unknown[]][];
  terminal?: "single" | "maybeSingle" | "many";
}

export interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

export type QueryHandler = (query: RecordedQuery) => QueryResult | Promise<QueryResult>;

type StorageResult = Promise<QueryResult>;

export function createFakeAdmin(handler: QueryHandler = () => ({ data: null, error: null })) {
  const queries: RecordedQuery[] = [];
  const storage = {
    upload: vi.fn<(path: string, body: unknown, options?: unknown) => StorageResult>(async (path) => ({
      data: { id: "object-id", path, fullPath: `scans/${path}` },
      error: null,
    })),
    remove: vi.fn<(paths: string[]) => StorageResult>(async (paths) => ({
      data: paths.map((name) => ({ name })),
      error: null,
    })),
    createSignedUrl: vi.fn<(path: string, expiresIn: number) => StorageResult>(async (path) => ({
      data: { signedUrl: `https://signed.test/${path}` },
      error: null,
    })),
    createSignedUrls: vi.fn<(paths: string[], expiresIn: number) => StorageResult>(async (paths) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}`, signedURL: null, error: null })),
      error: null,
    })),
  };
  const rpc = vi.fn<(fn: string) => Promise<QueryResult>>(async () => ({ data: [], error: null }));

  function builder(query: RecordedQuery) {
    queries.push(query);
    const run = (terminal: RecordedQuery["terminal"]) => {
      query.terminal = terminal;
      return Promise.resolve(handler(query));
    };
    const chain: Record<string, unknown> = {};
    for (const name of ["eq", "is", "in", "or", "order", "limit"]) {
      chain[name] = (...args: unknown[]) => {
        query.filters.push([name, ...args]);
        return chain;
      };
    }
    chain.select = (columns: string, options?: unknown) => {
      query.columns = columns;
      if (options !== undefined) query.options = options;
      return chain;
    };
    chain.single = () => run("single");
    chain.maybeSingle = () => run("maybeSingle");
    // Awaiting the builder itself (e.g. delete) resolves like PostgREST does.
    chain.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      run("many").then(resolve, reject);
    return chain;
  }

  const client = {
    from: (table: string) => ({
      select: (columns: string, options?: unknown) => builder({ op: "select", table, columns, options, filters: [] }),
      insert: (payload: unknown) => builder({ op: "insert", table, payload, filters: [] }),
      update: (payload: unknown) => builder({ op: "update", table, payload, filters: [] }),
      delete: () => builder({ op: "delete", table, filters: [] }),
    }),
    storage: { from: vi.fn(() => storage) },
    // Like PostgREST's builder: awaitable directly or after .abortSignal().
    rpc: (fn: string) => {
      const result = rpc(fn);
      return Object.assign(result, { abortSignal: () => result });
    },
  };

  return { client: client as unknown as AdminClient, queries, storage, rpc };
}

export const VISITOR_ID = "6f1c2b9e-3d4a-4f5b-8c7d-9e0f1a2b3c4d";
export const USER_ID = "0b6a1f3e-8c2d-4e5f-9a7b-1c2d3e4f5a6b";
export const OTHER_USER_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
export const SCAN_ID = "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
export const COMPANY_ID = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
export const OTHER_COMPANY_ID = "7c6b5a49-3827-4165-9b4a-3c2d1e0f9a8b";
export const CASE_NUMBER = "HDX-2026-1024-7731";

/** A certificates row as embedded by SCAN_COLUMNS; override what a test cares about. */
export function certificateRecord(overrides: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: "c0ffee00-0000-4000-8000-000000000001",
    scan_id: SCAN_ID,
    number: "HDX-C-0088301",
    code: "7KQ2-M9XD",
    issued_to: "Hooli Foods",
    product_name: null,
    sku: null,
    status: "valid",
    revoked_at: null,
    revoked_reason: null,
    verification_count: 3,
    last_verified_at: null,
    created_at: "2026-10-24T10:15:57.000000+00:00",
    ...overrides,
  };
}

/** A complete scans row; override what a test cares about. */
export function scanRecord(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: SCAN_ID,
    case_number: CASE_NUMBER,
    share_slug: "AbCdEfGh_-12",
    user_id: USER_ID,
    visitor_id: null,
    company_id: null,
    verdict: "hot_dog",
    confidence: 0.97,
    summary: "Hot dog confirmed. Procurement may proceed.",
    details: {
      verdict: "hot_dog",
      confidence: 0.97,
      summary: "Hot dog confirmed. Procurement may proceed.",
      reasoning: "A sausage in a split bun with mustard.",
      detectedItems: ["sausage", "bun", "mustard"],
      flags: ["partial_view"],
      policyClause: "2.1",
      rating: 92,
      ratingNote: "Canonical frankfurter, evenly applied mustard.",
      cached: false,
    },
    policy_clause: "2.1",
    rating: 92,
    rating_note: "Canonical frankfurter, evenly applied mustard.",
    region: "EU-C",
    file_name: "frankfurter_lot14.jpg",
    image_path: `${USER_ID}/${SCAN_ID}.jpg`,
    image_bytes: 245_760,
    image_deleted_at: null,
    model: "claude-haiku-5-5",
    latency_ms: 1234,
    is_public: false,
    feedback: null,
    review_status: null,
    // Recent by default, so the image is still inside its retention window.
    created_at: new Date(Date.now() - 60_000).toISOString(),
    certificates: null,
    ...overrides,
  };
}
