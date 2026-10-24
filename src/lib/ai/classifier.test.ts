import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverEnv, type ServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { POLICY_CLAUSE_IDS } from "@/lib/policy";
import {
  classifyImage,
  createClassifier,
  DEFAULT_CLASSIFIER_MODEL,
  type ClassifyInput,
  type MessagesClient,
} from "./classifier";
import { OUTPUT_LIMITS } from "./output";

vi.mock("@/lib/env", () => ({ serverEnv: vi.fn() }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const input: ClassifyInput = { bytes: PNG, mimeType: "image/png" };

const validOutput = {
  detectedItems: ["frankfurter", "split bun", "mustard"],
  reasoning: "A frankfurter is seated lengthwise in a split bun with a line of mustard. This matches §2.1.",
  flags: [],
  policyClause: "2.1",
  verdict: "hot_dog",
  confidence: 0.97,
  summary: "Specimen meets the canonical form in full.",
  rating: 92,
  ratingNote: "Bun and sausage exemplary; mustard line wavers slightly.",
};

function message(output: unknown, overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-test-model",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: typeof output === "string" ? output : JSON.stringify(output), citations: null },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1500, output_tokens: 120 },
    ...overrides,
  } as unknown as Anthropic.Message;
}

type CreateFn = MessagesClient["messages"]["create"];

function fakeClient(impl?: CreateFn) {
  const create = vi.fn<CreateFn>(impl ?? (async () => message(validOutput)));
  return { client: { messages: { create } } satisfies MessagesClient, create };
}

/** Resolves never; rejects the way the SDK does once the request's signal aborts. */
const hangUntilAborted: CreateFn = (_body, options) =>
  new Promise((_, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError()));
  });

async function appErrorOf(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => {
      throw new Error("expected the promise to reject");
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const overloaded = () =>
  new Anthropic.InternalServerError(
    529,
    { type: "error", error: { type: "overloaded_error", message: "Overloaded (provider detail)" } },
    "Overloaded (provider detail)",
    new Headers(),
  );

describe("createClassifier", () => {
  it("returns a validated classification with the model and latency", async () => {
    const { client, create } = fakeClient();
    const result = await createClassifier({ client, model: "claude-primary" })(input);

    expect(result.classification).toEqual({
      verdict: "hot_dog",
      confidence: 0.97,
      summary: validOutput.summary,
      reasoning: validOutput.reasoning,
      detectedItems: ["frankfurter", "split bun", "mustard"],
      flags: [],
      policyClause: "2.1",
      rating: 92,
      ratingNote: validOutput.ratingNote,
    });
    expect(result.model).toBe("claude-test-model");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("sends the image as base64 with structured output, low effort, and a cached system prompt", async () => {
    const { client, create } = fakeClient();
    await createClassifier({ client, model: "claude-primary" })(input);

    const [body, options] = create.mock.calls[0];
    expect(body.model).toBe("claude-primary");
    expect(body.output_config?.effort).toBe("low");
    expect(body.output_config?.format?.type).toBe("json_schema");
    expect(body.output_config?.format?.schema).toMatchObject({
      additionalProperties: false,
      properties: { policyClause: { enum: POLICY_CLAUSE_IDS } },
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("thinking");
    expect(body.system).toEqual([expect.objectContaining({ cache_control: { type: "ephemeral" } })]);

    const content = body.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: Buffer.from(PNG).toString("base64") },
    });
    expect(content[1]).toMatchObject({ type: "text" });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends the sniffed media type when the declared one is wrong", async () => {
    const { client, create } = fakeClient();
    await createClassifier({ client, model: "m" })({ bytes: PNG, mimeType: "image/jpeg" });
    const content = create.mock.calls[0][0].messages[0].content as Anthropic.ImageBlockParam[];
    expect(content[0].source).toMatchObject({ media_type: "image/png" });
  });

  it("clamps confidence, filters and dedupes flags, and trims long strings", async () => {
    const { client } = fakeClient(async () =>
      message({
        detectedItems: [
          "  Hot   Dog ",
          "hot dog",
          "MUSTARD",
          "x".repeat(80),
          "",
          42,
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
        ],
        reasoning: "word ".repeat(300),
        flags: ["illustration", "made_up_flag", "illustration", "corn_dog", 7],
        policyClause: "3.9",
        verdict: "not_hot_dog",
        confidence: 1.7,
        summary: `  ${"Memo. ".repeat(80)}  `,
      }),
    );
    const { classification } = await createClassifier({ client, model: "m" })(input);

    expect(classification.confidence).toBe(1);
    expect(classification.flags).toEqual(["illustration", "corn_dog"]);
    expect(classification.summary.length).toBeLessThanOrEqual(OUTPUT_LIMITS.summary);
    expect(classification.summary.endsWith("…")).toBe(true);
    expect(classification.reasoning.length).toBeLessThanOrEqual(OUTPUT_LIMITS.reasoning);
    expect(classification.detectedItems).toHaveLength(OUTPUT_LIMITS.detectedItems);
    expect(classification.detectedItems.slice(0, 2)).toEqual(["hot dog", "mustard"]);
    expect(classification.detectedItems[2]).toHaveLength(OUTPUT_LIMITS.detectedItemLength);
  });

  it("clamps negative confidence to 0", async () => {
    const { client } = fakeClient(async () => message({ ...validOutput, confidence: -0.3 }));
    const { classification } = await createClassifier({ client, model: "m" })(input);
    expect(classification.confidence).toBe(0);
  });

  it("repairs invalid output once, telling the model what was wrong", async () => {
    const { client, create } = fakeClient();
    create.mockResolvedValueOnce(message({ ...validOutput, verdict: "maybe" }));

    const { classification } = await createClassifier({ client, model: "m" })(input);

    expect(classification.verdict).toBe("hot_dog");
    expect(create).toHaveBeenCalledTimes(2);
    const repairContent = create.mock.calls[1][0].messages[0].content as Anthropic.ContentBlockParam[];
    expect(repairContent[1]).toMatchObject({ text: expect.stringContaining("previous attempt was rejected (verdict:") });
  });

  it("gives a cut-off reply more room on the repair attempt", async () => {
    const { client, create } = fakeClient();
    create.mockResolvedValueOnce(message('{"detectedItems": ["hot d', { stop_reason: "max_tokens" }));

    await createClassifier({ client, model: "m" })(input);

    expect(create.mock.calls[1][0].max_tokens).toBe(create.mock.calls[0][0].max_tokens * 2);
    const repairContent = create.mock.calls[1][0].messages[0].content as Anthropic.ContentBlockParam[];
    expect(repairContent[1]).toMatchObject({ text: expect.stringContaining("cut off") });
  });

  it("re-asks once when the clause contradicts the verdict, and takes the corrected reply", async () => {
    const { client, create } = fakeClient();
    create.mockResolvedValueOnce(message({ ...validOutput, policyClause: "3.2" }));

    const { classification } = await createClassifier({ client, model: "m" })(input);

    expect(classification.policyClause).toBe("2.1");
    expect(create).toHaveBeenCalledTimes(2);
    const repairContent = create.mock.calls[1][0].messages[0].content as Anthropic.ContentBlockParam[];
    expect(repairContent[1]).toMatchObject({
      text: expect.stringContaining("policyClause 3.2 (Unaccompanied sausage) is a not_hot_dog clause but the verdict is hot_dog"),
    });
  });

  it("keeps the verdict and infers the clause from the flags when the contradiction persists", async () => {
    const { client, create } = fakeClient(async () =>
      message({ ...validOutput, flags: ["corn_dog"], policyClause: "3.9" }),
    );

    const { classification } = await createClassifier({ client, model: "m" })(input);

    expect(classification).toMatchObject({ verdict: "hot_dog", policyClause: "2.4", rating: 92 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("falls back to the repaired first reply when the re-ask is unusable", async () => {
    const { client, create } = fakeClient();
    create.mockResolvedValueOnce(message({ ...validOutput, verdict: "not_hot_dog", policyClause: "2.1" }));
    create.mockResolvedValueOnce(message("not json"));

    const { classification } = await createClassifier({ client, model: "m" })(input);

    expect(classification).toMatchObject({ verdict: "not_hot_dog", policyClause: "3.9", rating: null, ratingNote: null });
  });

  it("re-asks for a missing hot dog rating once, then leaves it null rather than inventing one", async () => {
    const { client, create } = fakeClient(async () => message({ ...validOutput, rating: null }));

    const { classification } = await createClassifier({ client, model: "m" })(input);

    expect(classification).toMatchObject({ verdict: "hot_dog", rating: null, ratingNote: null });
    expect(create).toHaveBeenCalledTimes(2);
    const repairContent = create.mock.calls[1][0].messages[0].content as Anthropic.ContentBlockParam[];
    expect(repairContent[1]).toMatchObject({ text: expect.stringContaining("rating must be an integer") });
  });

  it("nulls a rating the model gave to a NOT HOT DOG without re-asking", async () => {
    const { client, create } = fakeClient(async () =>
      message({ ...validOutput, verdict: "not_hot_dog", policyClause: "3.5", rating: 40 }),
    );

    const { classification } = await createClassifier({ client, model: "m" })(input);

    expect(classification).toMatchObject({ policyClause: "3.5", rating: null, ratingNote: null });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("gives up with UNPROCESSABLE_IMAGE after one failed repair", async () => {
    const { client, create } = fakeClient(async () => message("not json at all"));
    const error = await appErrorOf(createClassifier({ client, model: "m" })(input));

    expect(error.code).toBe("UNPROCESSABLE_IMAGE");
    expect(error.status).toBe(422);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("maps a refusal to UNPROCESSABLE_IMAGE without retrying or leaking the category", async () => {
    const { client, create } = fakeClient(async () =>
      message("", {
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "general_harms", explanation: "provider detail" },
      } as Partial<Anthropic.Message>),
    );
    const error = await appErrorOf(createClassifier({ client, model: "m" })(input));

    expect(error.code).toBe("UNPROCESSABLE_IMAGE");
    expect(error.message).not.toMatch(/general_harms|provider detail/);
    expect(String((error.cause as Error).message)).toContain("general_harms");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("times out with AI_TIMEOUT when the budget runs out", async () => {
    const { client } = fakeClient(hangUntilAborted);
    const error = await appErrorOf(createClassifier({ client, model: "m", timeoutMs: 20 })(input));

    expect(error.code).toBe("AI_TIMEOUT");
    expect(error.status).toBe(504);
    expect(error.retryable).toBe(true);
  });

  it("maps the SDK's own per-attempt timeout to AI_TIMEOUT", async () => {
    const { client } = fakeClient(async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    expect((await appErrorOf(createClassifier({ client, model: "m" })(input))).code).toBe("AI_TIMEOUT");
  });

  it("rethrows the caller's abort reason instead of reporting a timeout", async () => {
    const { client } = fakeClient(hangUntilAborted);
    const controller = new AbortController();
    const reason = new Error("client went away");
    const pending = createClassifier({ client, model: "m" })({ ...input, signal: controller.signal });
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  it("does not call the API when the caller's signal is already aborted", async () => {
    const { client, create } = fakeClient();
    const signal = AbortSignal.abort(new Error("already gone"));
    await expect(createClassifier({ client, model: "m" })({ ...input, signal })).rejects.toThrow("already gone");
    expect(create).not.toHaveBeenCalled();
  });

  it("maps overload to a retryable AI_UNAVAILABLE without leaking provider text", async () => {
    const { client } = fakeClient(async () => {
      throw overloaded();
    });
    const error = await appErrorOf(createClassifier({ client, model: "m" })(input));

    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.status).toBe(503);
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("provider detail");
    expect(error.cause).toBeInstanceOf(Anthropic.InternalServerError);
  });

  it("tries the fallback model once when the primary is overloaded", async () => {
    const { client, create } = fakeClient();
    create.mockRejectedValueOnce(overloaded());
    create.mockResolvedValueOnce(message(validOutput, { model: "claude-fallback" }));

    const result = await createClassifier({ client, model: "claude-primary", fallbackModel: "claude-fallback" })(input);

    expect(result.model).toBe("claude-fallback");
    expect(create.mock.calls.map(([body]) => body.model)).toEqual(["claude-primary", "claude-fallback"]);
  });

  it("reports AI_UNAVAILABLE when the fallback is overloaded too", async () => {
    const { client, create } = fakeClient(async () => {
      throw overloaded();
    });
    const error = await appErrorOf(createClassifier({ client, model: "a", fallbackModel: "b" })(input));
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("passes Retry-After through on rate limits", async () => {
    const { client } = fakeClient(async () => {
      throw new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers({ "retry-after": "7" }));
    });
    const error = await appErrorOf(createClassifier({ client, model: "m" })(input));
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.retryAfterSeconds).toBe(7);
  });

  it("maps a 400 to UNPROCESSABLE_IMAGE and does not fall back", async () => {
    const { client, create } = fakeClient(async () => {
      throw new Anthropic.BadRequestError(400, undefined, "Could not process image", new Headers());
    });
    const error = await appErrorOf(createClassifier({ client, model: "a", fallbackModel: "b" })(input));
    expect(error.code).toBe("UNPROCESSABLE_IMAGE");
    expect(error.message).not.toContain("Could not process image");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("maps a bad key to a non-retryable AI_UNAVAILABLE", async () => {
    const { client } = fakeClient(async () => {
      throw new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", new Headers());
    });
    const error = await appErrorOf(createClassifier({ client, model: "m" })(input));
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.retryable).toBe(false);
  });

  it("maps connection failures to a retryable AI_UNAVAILABLE", async () => {
    const { client } = fakeClient(async () => {
      throw new Anthropic.APIConnectionError({ message: "socket hang up" });
    });
    const error = await appErrorOf(createClassifier({ client, model: "m" })(input));
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.retryable).toBe(true);
  });

  it("rethrows unexpected non-SDK errors untouched", async () => {
    const bug = new TypeError("bug");
    const { client } = fakeClient(async () => {
      throw bug;
    });
    await expect(createClassifier({ client, model: "m" })(input)).rejects.toBe(bug);
  });
});

describe("classifyImage", () => {
  const env = (overrides: Partial<ServerEnv>) =>
    vi.mocked(serverEnv).mockReturnValue({
      RATE_LIMIT_PER_MINUTE: 10,
      RATE_LIMIT_PER_DAY: 100,
      GLOBAL_DAILY_SCAN_CAP: 2000,
      ...overrides,
    } as ServerEnv);

  beforeEach(() => vi.mocked(serverEnv).mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("throws AI_NOT_CONFIGURED without an API key", async () => {
    env({ ANTHROPIC_API_KEY: undefined });
    const error = await appErrorOf(classifyImage(input));
    expect(error.code).toBe("AI_NOT_CONFIGURED");
    expect(error.status).toBe(503);
  });

  it("calls the Messages API through the real SDK with the default model", async () => {
    env({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(message(validOutput, { model: DEFAULT_CLASSIFIER_MODEL })), {
          status: 200,
          headers: { "content-type": "application/json", "request-id": "req_test" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifyImage(input);

    expect(result.model).toBe(DEFAULT_CLASSIFIER_MODEL);
    expect(result.classification.verdict).toBe("hot_dog");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/messages$/);
    // SDK 1.x sends the key as a bearer token; older versions used x-api-key.
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization") ?? headers.get("x-api-key")).toContain("sk-ant-test");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(DEFAULT_CLASSIFIER_MODEL);
    expect(body.output_config.format.schema.properties.flags.items.enum).toContain("illustration");
  });
});
