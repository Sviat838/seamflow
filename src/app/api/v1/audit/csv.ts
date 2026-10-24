// RFC 4180 CSV for the per-case audit export. Pure.
import type { AuditEvent } from "@/lib/types";

export const AUDIT_CSV_COLUMNS = ["occurred_at", "event", "actor", "detail", "hash", "prev_hash"] as const;

// Spreadsheets run cells starting with these as formulas (CSV injection). Actor names come from
// Google profiles, so a leading apostrophe keeps such a cell plain text. Our own wording never
// starts this way, so the trail stays verifiable against its hashes in practice.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | null): string {
  const text = value === null ? "" : FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Header plus one row per event, CRLF line endings. Starts with a BOM so Excel reads it as UTF-8. */
export function toAuditCsv(events: AuditEvent[]): string {
  const rows = events.map((e) => [e.occurredAt, e.event, e.actor, e.detail, e.hash, e.prevHash]);
  return `﻿${[AUDIT_CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
