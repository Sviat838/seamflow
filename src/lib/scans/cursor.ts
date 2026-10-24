// Opaque keyset cursor for scan history: base64url of [created_at, id] from the last row.
import { z } from "zod";
import { AppError } from "@/lib/errors";

export interface ScanCursor {
  /** Raw Postgres timestamptz text. Kept verbatim: JS Dates drop the microseconds. */
  createdAt: string;
  id: string;
}

// Strict shape so a decoded cursor is always safe to embed in a PostgREST filter.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const cursorSchema = z.tuple([z.string().regex(TIMESTAMP), z.uuid()]);

export function encodeCursor({ createdAt, id }: ScanCursor): string {
  return Buffer.from(JSON.stringify([createdAt, id]), "utf8").toString("base64url");
}

/** Throws AppError INVALID_REQUEST for anything this module didn't produce. */
export function decodeCursor(cursor: string): ScanCursor {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.success) {
      const [createdAt, id] = parsed.data;
      return { createdAt, id };
    }
  } catch {
    // Not base64url JSON; fall through to the same error as a wrong shape.
  }
  throw new AppError("INVALID_REQUEST", "That page of results is no longer valid. Reload the list.");
}
