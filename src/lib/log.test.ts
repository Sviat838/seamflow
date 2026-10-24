import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/log";

function lastLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  expect(call).toBeDefined();
  return JSON.parse(String(call![0]));
}

describe("log", () => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stderr = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("writes one JSON line per event, routed by level", () => {
    log.info("scan.created", { scanId: "abc", latencyMs: 812 });
    log.warn("rate_limit.fallback");
    log.error("request.failed", { status: 500 });

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(stderr).toHaveBeenCalledTimes(1);
    const line = lastLine(stdout);
    expect(line).toMatchObject({ level: "info", event: "scan.created", scanId: "abc", latencyMs: 812 });
    expect(Date.parse(String(line.time))).not.toBeNaN();
    expect(String(stdout.mock.calls[0][0])).not.toContain("\n");
    expect(lastLine(warn)).toMatchObject({ level: "warn", event: "rate_limit.fallback" });
    expect(lastLine(stderr)).toMatchObject({ level: "error", status: 500 });
  });

  it("redacts sensitive keys at any depth", () => {
    log.info("config", {
      apiKey: "sk-ant-123",
      SUPABASE_SECRET_KEY: "sb_secret_abc",
      nested: { accessToken: "t0k", list: [{ password: "hunter2" }], Authorization: "Bearer x" },
      headers: { cookie: "sb=1", "set-cookie": "a=b", "x-api-key": "k" },
      model: "claude",
    });

    const line = lastLine(stdout);
    expect(JSON.stringify(line)).not.toMatch(/sk-ant-123|sb_secret_abc|t0k|hunter2|Bearer x|sb=1|a=b/);
    expect(line).toMatchObject({
      apiKey: "[REDACTED]",
      SUPABASE_SECRET_KEY: "[REDACTED]",
      nested: { accessToken: "[REDACTED]", list: [{ password: "[REDACTED]" }], Authorization: "[REDACTED]" },
      headers: { cookie: "[REDACTED]", "set-cookie": "[REDACTED]", "x-api-key": "[REDACTED]" },
      model: "claude",
    });
  });

  it("keeps numeric and boolean fields whose names only look sensitive", () => {
    log.info("ai.usage", { inputTokens: 1200, outputTokens: 80, cacheKeyHit: true, apiKey: undefined });
    expect(lastLine(stdout)).toMatchObject({ inputTokens: 1200, outputTokens: 80, cacheKeyHit: true });
  });

  it("serializes errors with their cause chain and redacts inside them", () => {
    const root = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED", token: "leak" });
    const error = new Error("upload failed", { cause: root });

    log.error("storage.failed", { error });

    const logged = lastLine(stderr).error as Record<string, unknown>;
    expect(logged).toMatchObject({
      name: "Error",
      message: "upload failed",
      cause: { name: "Error", message: "connect ECONNREFUSED", code: "ECONNREFUSED", token: "[REDACTED]" },
    });
    expect(typeof logged.stack).toBe("string");
  });

  it("omits stacks in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    log.error("boom", { error: new Error("x") });
    expect(lastLine(stderr).error).not.toHaveProperty("stack");
  });

  it("never dumps binary data and survives circular references", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    log.info("upload", { bytes: new Uint8Array(1024), blob: new Blob(["abc"]), circular, big: BigInt(10) });

    expect(lastLine(stdout)).toMatchObject({
      bytes: "[1024 bytes]",
      blob: "[3 bytes]",
      circular: { name: "loop", self: "[Circular]" },
      big: "10",
    });
  });

  it("does not let fields overwrite time, level or event", () => {
    log.info("real.event", { event: "fake", level: "error" });
    expect(lastLine(stdout)).toMatchObject({
      event: "real.event",
      level: "info",
      field_event: "fake",
      field_level: "error",
    });
  });
});
