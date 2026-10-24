import { describe, expect, it } from "vitest";
import type { Scan } from "@/lib/types";
import { errorCopy } from "./errors";
import { initialScanMachine, scanReducer, type ScanAction, type ScanMachine } from "./scan-state";

const scan = { id: "scan_1", verdict: "hot_dog", confidence: 0.97 } as Scan;

function run(actions: ScanAction[], from: ScanMachine = initialScanMachine): ScanMachine {
  return actions.reduce(scanReducer, from);
}

describe("scanReducer", () => {
  it("walks the happy path: idle → preparing → uploading → analyzing → done", () => {
    let machine = run([{ type: "start", run: 1, previewUrl: "blob:1" }]);
    expect(machine.state).toEqual({ status: "preparing", previewUrl: "blob:1" });

    machine = run([{ type: "prepared", run: 1 }], machine);
    expect(machine.state).toEqual({ status: "uploading", previewUrl: "blob:1", progress: 0 });

    machine = run([{ type: "progress", run: 1, fraction: 0.4 }], machine);
    expect(machine.state).toEqual({ status: "uploading", previewUrl: "blob:1", progress: 0.4 });

    machine = run([{ type: "progress", run: 1, fraction: 1 }], machine);
    expect(machine.state).toEqual({ status: "analyzing", previewUrl: "blob:1" });

    machine = run([{ type: "succeeded", run: 1, scan }], machine);
    expect(machine.state).toEqual({ status: "done", previewUrl: "blob:1", scan });
  });

  it("keeps progress monotonic and clamped", () => {
    const machine = run([
      { type: "start", run: 1, previewUrl: null },
      { type: "prepared", run: 1 },
      { type: "progress", run: 1, fraction: 0.6 },
      { type: "progress", run: 1, fraction: 0.3 },
      { type: "progress", run: 1, fraction: -2 },
    ]);
    expect(machine.state).toMatchObject({ status: "uploading", progress: 0.6 });
    expect(run([{ type: "progress", run: 1, fraction: 7 }], machine).state.status).toBe("analyzing");
  });

  it("ignores progress outside the uploading phase", () => {
    const preparing = run([{ type: "start", run: 1, previewUrl: null }]);
    expect(run([{ type: "progress", run: 1, fraction: 0.5 }], preparing)).toBe(preparing);

    const analyzing = run([{ type: "prepared", run: 1 }, { type: "progress", run: 1, fraction: 1 }], preparing);
    expect(run([{ type: "progress", run: 1, fraction: 0.5 }], analyzing)).toBe(analyzing);
  });

  it("can finish straight from uploading when the browser skips progress events", () => {
    const machine = run([
      { type: "start", run: 1, previewUrl: null },
      { type: "prepared", run: 1 },
      { type: "succeeded", run: 1, scan },
    ]);
    expect(machine.state).toEqual({ status: "done", previewUrl: null, scan });
  });

  it("records failures with house-style copy", () => {
    const machine = run([
      { type: "start", run: 1, previewUrl: "blob:1" },
      {
        type: "failed",
        run: 1,
        error: { code: "RATE_LIMITED", message: "Too many scans", requestId: "req_9", retryAfterSeconds: 45 },
      },
    ]);
    expect(machine.state).toEqual({
      status: "error",
      previewUrl: "blob:1",
      code: "RATE_LIMITED",
      message: "Too many scans",
      copy: errorCopy("RATE_LIMITED", { retryAfterSeconds: 45 }),
      requestId: "req_9",
      retryAfterSeconds: 45,
    });
  });

  it("drops results from a superseded submission", () => {
    const machine = run([
      { type: "start", run: 1, previewUrl: "blob:1" },
      { type: "start", run: 2, previewUrl: "blob:2" },
      { type: "succeeded", run: 1, scan },
      { type: "failed", run: 1, error: { code: "INTERNAL", message: "late" } },
    ]);
    expect(machine).toEqual({ run: 2, state: { status: "preparing", previewUrl: "blob:2" } });
  });

  it("drops late results after a reset", () => {
    const machine = run([
      { type: "start", run: 1, previewUrl: "blob:1" },
      { type: "prepared", run: 1 },
      { type: "reset", run: 2 },
      { type: "progress", run: 1, fraction: 0.5 },
      { type: "succeeded", run: 1, scan },
    ]);
    expect(machine).toEqual({ run: 2, state: { status: "idle" } });
  });

  it("ignores results once the run has settled", () => {
    const done = run([
      { type: "start", run: 1, previewUrl: null },
      { type: "succeeded", run: 1, scan },
    ]);
    expect(run([{ type: "failed", run: 1, error: { code: "INTERNAL", message: "x" } }], done)).toBe(done);
    expect(run([{ type: "prepared", run: 1 }], done)).toBe(done);
  });
});
