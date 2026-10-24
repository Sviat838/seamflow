import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/lib/errors";
import type { AcceptedImageType } from "@/lib/types";
import { sniffImageType } from "./image";
import type { ParseResult } from "./output";

// The request loop shared by the classifier and the Review Board: one structured-output request,
// one repair attempt, an optional fallback model on capacity errors, and SDK errors mapped to
// user-safe AppErrors.

/** The part of the SDK client the AI calls need; tests pass a fake. */
export interface MessagesClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: Anthropic.RequestOptions,
    ): PromiseLike<Anthropic.Message>;
  };
}

/** User-safe messages for each failure. Provider detail goes into `cause`, never in here. */
export interface ErrorCopy {
  timeout: string;
  busy: string;
  unavailable: string;
  refused: string;
  unusable: string;
  rejected: string;
}

export interface StructuredCall<T> {
  client: MessagesClient;
  model: string;
  /** Tried once when the primary model is overloaded or rate limited (separate capacity pool). */
  fallbackModel?: string | null;
  /** Whole-call budget, retries and fallback included. */
  timeoutMs: number;
  /** Per HTTP attempt, so one hung connection still leaves time for an SDK retry. */
  attemptTimeoutMs: number;
  /** Don't start the fallback model unless it has a realistic chance to finish. */
  minFallbackBudgetMs: number;
  copy: ErrorCopy;
  /** Builds one attempt. `rejection` says why the previous reply was refused; null on the first attempt. */
  request(model: string, rejection: string | null): Anthropic.MessageCreateParamsNonStreaming;
  parse(text: string): ParseResult<T>;
  signal?: AbortSignal;
}

export interface StructuredResult<T> {
  value: T;
  /** Model id actually used. */
  model: string;
  latencyMs: number;
}

export function imageBlock(bytes: Uint8Array, mimeType: AcceptedImageType): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      // Trust the bytes over the declared type: a mismatched media_type is a 400 from the API.
      media_type: sniffImageType(bytes) ?? mimeType,
      data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64"),
    },
  };
}

/** Throws AppError: AI_TIMEOUT | AI_UNAVAILABLE | UNPROCESSABLE_IMAGE, or the caller's abort reason. */
export async function callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const { client, copy, timeoutMs } = call;
  call.signal?.throwIfAborted();
  const startedAt = performance.now();
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = call.signal ? AbortSignal.any([call.signal, deadline]) : deadline;

  // One request plus one repair attempt on output we can't accept as is.
  async function run(modelId: string): Promise<{ value: T; model: string }> {
    let rejection: string | null = null;
    let repaired: { value: T; model: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await client.messages.create(call.request(modelId, rejection), {
        signal,
        timeout: call.attemptTimeoutMs,
      });

      if (response.stop_reason === "refusal") {
        throw new AppError("UNPROCESSABLE_IMAGE", copy.refused, {
          cause: new Error(`${modelId} refused (category: ${response.stop_details?.category ?? "none"})`),
        });
      }

      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      const parsed = call.parse(text);
      const model = response.model || modelId;
      if (parsed.ok && (!parsed.issue || repaired)) return { value: parsed.value, model };
      if (parsed.ok) {
        // Usable after a local repair: ask once more, but keep the repair in case that goes worse.
        repaired = { value: parsed.value, model };
        rejection = parsed.issue ?? null;
      } else {
        rejection = response.stop_reason === "max_tokens" ? "the reply was cut off" : parsed.reason;
      }
    }
    if (repaired) return repaired;
    throw new AppError("UNPROCESSABLE_IMAGE", copy.unusable, {
      cause: new Error(`${modelId} returned unusable output twice: ${rejection}`),
    });
  }

  try {
    let result: { value: T; model: string };
    try {
      result = await run(call.model);
    } catch (error) {
      const remaining = timeoutMs - (performance.now() - startedAt);
      if (!call.fallbackModel || !isCapacityError(error) || remaining < call.minFallbackBudgetMs) throw error;
      result = await run(call.fallbackModel);
    }
    return { ...result, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    throw toAppError(error, copy, call.signal, deadline);
  }
}

function isCapacityError(error: unknown): boolean {
  // InternalServerError covers 5xx including 529 overloaded; these arrive after the SDK's own retries.
  return error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError;
}

/** Maps SDK failures to user-safe AppErrors. Provider detail goes into `cause`, never the message. */
function toAppError(
  error: unknown,
  copy: ErrorCopy,
  callerSignal: AbortSignal | undefined,
  deadline: AbortSignal,
): unknown {
  if (error instanceof AppError) return error;
  // The caller gave up (e.g. the client disconnected): surface their abort reason, not a timeout.
  if (callerSignal?.aborted) return callerSignal.reason;

  if (deadline.aborted || error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AppError("AI_TIMEOUT", copy.timeout, { retryable: true, cause: error });
  }

  if (
    error instanceof Anthropic.BadRequestError ||
    error instanceof Anthropic.UnprocessableEntityError ||
    (error instanceof Anthropic.APIError && error.status === 413)
  ) {
    // Request shapes are fixed and covered by tests, so a 400 here is almost always the image
    // itself (corrupt data, extreme dimensions).
    return new AppError("UNPROCESSABLE_IMAGE", copy.rejected, { cause: error });
  }

  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.NotFoundError
  ) {
    // Bad key or unknown model override: retrying won't help until someone fixes the config.
    return new AppError("AI_UNAVAILABLE", copy.unavailable, { cause: error });
  }

  if (error instanceof Anthropic.APIError) {
    // 429, 5xx/529 overloaded, connection failures: worth retrying in a moment.
    const retryAfter = Number(error.headers?.get("retry-after"));
    return new AppError("AI_UNAVAILABLE", copy.busy, {
      retryable: true,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined,
      cause: error,
    });
  }

  return error;
}
