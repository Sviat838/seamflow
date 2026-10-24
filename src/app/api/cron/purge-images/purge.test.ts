import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAdmin, filterValue, type RecordedQuery } from "@/lib/appeals/testing";
import { PURGE_BATCH_SIZE, purgeExpiredImages, RETENTION_ACTOR, RETENTION_DETAIL } from "./purge";

const mocks = vi.hoisted(() => ({ recordAuditEvents: vi.fn(), log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/audit/record", () => ({ recordAuditEvents: mocks.recordAuditEvents }));
vi.mock("@/lib/supabase/admin", () => ({ SCANS_BUCKET: "scans" }));
vi.mock("@/lib/log", () => ({ log: mocks.log }));

const NOW = new Date("2026-10-25T04:00:00.000Z");
const candidates = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `scan-${i}`, image_path: `anon/scan-${i}.jpg` }));

/** Candidate rows for the select; the update echoes back every id it was scoped to. */
function withScans(rows: Array<{ id: string; image_path: string | null }>, markError?: unknown) {
  return createFakeAdmin((q: RecordedQuery) => {
    if (q.op === "select") return { data: rows, error: null };
    if (markError) return { data: null, error: markError };
    const ids = filterValue(q, "in", "id") as string[];
    return { data: ids.map((id) => ({ id })), error: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordAuditEvents.mockResolvedValue(undefined);
});

describe("purgeExpiredImages", () => {
  it("finds images past retention, deletes them, marks the scans and audits each", async () => {
    const fake = withScans(candidates(2));

    expect(await purgeExpiredImages(fake.client, NOW)).toEqual({ candidates: 2, deleted: 2, failed: 0 });

    const [select] = fake.queries;
    expect(select.columns).toBe("id, image_path");
    expect(select.calls).toEqual([
      ["not", "image_path", "is", null],
      ["is", "image_deleted_at", null],
      ["lt", "created_at", "2026-10-24T04:00:00.000Z"],
      ["order", "created_at", { ascending: true }],
      ["limit", PURGE_BATCH_SIZE],
    ]);
    expect(fake.storage.remove).toHaveBeenCalledWith(["anon/scan-0.jpg", "anon/scan-1.jpg"]);

    const update = fake.queries.find((q) => q.op === "update");
    expect(update?.payload).toEqual({ image_deleted_at: NOW.toISOString() });
    expect(filterValue(update!, "is", "image_deleted_at")).toBeNull();

    expect(mocks.recordAuditEvents.mock.calls).toEqual([
      ["scan-0", [{ event: "image_deleted", actor: RETENTION_ACTOR, detail: RETENTION_DETAIL }]],
      ["scan-1", [{ event: "image_deleted", actor: RETENTION_ACTOR, detail: RETENTION_DETAIL }]],
    ]);
    expect(RETENTION_DETAIL).toBe("Image deleted automatically after 24 hours under the retention policy.");
  });

  it("removes objects in chunks of 100", async () => {
    const fake = withScans(candidates(250));
    expect(await purgeExpiredImages(fake.client, NOW)).toMatchObject({ candidates: 250, deleted: 250 });
    expect(fake.storage.remove.mock.calls.map(([paths]) => paths.length)).toEqual([100, 100, 50]);
    expect(mocks.recordAuditEvents).toHaveBeenCalledTimes(250);
  });

  it("audits only rows this run marked, so an overlapping run can't double-audit", async () => {
    const fake = createFakeAdmin((q) =>
      q.op === "select" ? { data: candidates(3), error: null } : { data: [{ id: "scan-1" }], error: null },
    );
    expect(await purgeExpiredImages(fake.client, NOW)).toEqual({ candidates: 3, deleted: 1, failed: 0 });
    expect(mocks.recordAuditEvents.mock.calls.map(([id]) => id)).toEqual(["scan-1"]);
  });

  it("leaves a chunk for the next run when storage refuses it", async () => {
    const fake = withScans(candidates(2));
    fake.storage.remove.mockResolvedValue({ data: null, error: { message: "storage down" } });
    expect(await purgeExpiredImages(fake.client, NOW)).toEqual({ candidates: 2, deleted: 0, failed: 2 });
    expect(fake.queries.some((q) => q.op === "update")).toBe(false);
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
  });

  it("counts rows it couldn't mark as failed, without auditing them", async () => {
    const fake = withScans(candidates(2), { message: "timeout" });
    expect(await purgeExpiredImages(fake.client, NOW)).toEqual({ candidates: 2, deleted: 0, failed: 2 });
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
  });

  it("does nothing when nothing has expired", async () => {
    const fake = withScans([]);
    expect(await purgeExpiredImages(fake.client, NOW)).toEqual({ candidates: 0, deleted: 0, failed: 0 });
    expect(fake.storage.remove).not.toHaveBeenCalled();
  });

  it("throws when the candidate query fails", async () => {
    const fake = createFakeAdmin(() => ({ data: null, error: { message: "boom" } }));
    await expect(purgeExpiredImages(fake.client, NOW)).rejects.toThrow("candidate query failed");
  });
});
