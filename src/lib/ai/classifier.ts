import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { AcceptedImageType, Classification } from "@/lib/types";
import { callStructured, imageBlock, type ErrorCopy, type MessagesClient } from "./engine";
import { parseClassification } from "./output";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, USER_INSTRUCTION, withRepairNote } from "./prompt";

export type { MessagesClient } from "./engine";

export interface ClassifyInput {
  bytes: Uint8Array;
  mimeType: AcceptedImageType;
  signal?: AbortSignal;
}

export interface ClassifierOutput {
  /** Validated and clamped; flags filtered to CLASSIFICATION_FLAGS; clause consistent with the verdict. */
  classification: Classification;
  /** Model id actually used. */
  model: string;
  latencyMs: number;
}

// Opus at low effort answers in ~3.5-4 s and writes the sharpest headline copy. Haiku is ~2.3 s and
// far cheaper but blander; it's the overload fallback (separate capacity) and a one-line
// CLASSIFIER_MODEL switch if speed or cost matter more. Both measured with classifier.live.test.ts.
// An override must support structured outputs and `effort` (any Claude 5.x model, or Opus 4.8).
export const DEFAULT_CLASSIFIER_MODEL = "claude-opus-5-5";
export const FALLBACK_CLASSIFIER_MODEL = "claude-haiku-5-5";

/** Whole-call budget, retries and fallback included. The user is watching a spinner. */
const DEFAULT_TIMEOUT_MS = 25_000;
// The first requests after a schema change wait for structured-output grammar compilation (cached
// for 24 h afterwards): two live calls ran past 15 s, so a slow first attempt gets 20 s.
const ATTEMPT_TIMEOUT_MS = 20_000;
const MIN_FALLBACK_BUDGET_MS = 6_000;
/** Thinking counts toward max_tokens; the JSON itself is ~300 tokens. */
const MAX_TOKENS = 4096;

const COPY: ErrorCopy = {
  timeout: "The classifier took too long to respond. Please try again.",
  busy: "The classifier is busy right now. Please try again in a moment.",
  unavailable: "The classifier is unavailable right now.",
  refused: "The classifier declined to assess this image. Please try a different photo.",
  unusable: "We couldn't get a clear reading on this image. Please try another photo.",
  rejected: "We couldn't process this image. Please try a different photo.",
};

export interface ClassifierOptions {
  client: MessagesClient;
  model: string;
  /** Tried once when the primary model is overloaded or rate limited (separate capacity pool). */
  fallbackModel?: string | null;
  timeoutMs?: number;
}

export type Classifier = (input: ClassifyInput) => Promise<ClassifierOutput>;

export function createClassifier({
  client,
  model,
  fallbackModel = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ClassifierOptions): Classifier {
  return async function classify(input) {
    const image = imageBlock(input.bytes, input.mimeType);
    const result = await callStructured({
      client,
      model,
      fallbackModel,
      timeoutMs,
      attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
      minFallbackBudgetMs: MIN_FALLBACK_BUDGET_MS,
      copy: COPY,
      signal: input.signal,
      request: (modelId, rejection) => ({
        model: modelId,
        max_tokens: rejection ? MAX_TOKENS * 2 : MAX_TOKENS,
        // Same prompt on every request, so cache it (silently skipped if under the model's minimum).
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [image, { type: "text", text: withRepairNote(USER_INSTRUCTION, rejection) }] }],
        // Low effort keeps adaptive thinking short: this is a glance-and-decide task.
        output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      }),
      parse: parseClassification,
    });
    return { classification: result.value, model: result.model, latencyMs: result.latencyMs };
  };
}

let defaultClassifier: Classifier | undefined;

/** Throws AppError: AI_NOT_CONFIGURED | AI_TIMEOUT | AI_UNAVAILABLE | UNPROCESSABLE_IMAGE. */
export async function classifyImage(input: ClassifyInput): Promise<ClassifierOutput> {
  const { ANTHROPIC_API_KEY: apiKey, CLASSIFIER_MODEL } = serverEnv();
  if (!apiKey) {
    throw new AppError("AI_NOT_CONFIGURED", "Image classification isn't configured on this server yet.");
  }
  if (!defaultClassifier) {
    const model = CLASSIFIER_MODEL ?? DEFAULT_CLASSIFIER_MODEL;
    defaultClassifier = createClassifier({
      client: new Anthropic({ apiKey, maxRetries: 2 }),
      model,
      fallbackModel: model === FALLBACK_CLASSIFIER_MODEL ? null : FALLBACK_CLASSIFIER_MODEL,
    });
  }
  return defaultClassifier(input);
}
