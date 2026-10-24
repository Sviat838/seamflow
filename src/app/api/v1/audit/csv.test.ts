import { describe, expect, it } from "vitest";
import type { AuditEvent } from "@/lib/types";
import { csvCell, toAuditCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("uploaded")).toBe("uploaded");
    expect(csvCell("2026-10-24T10:15:56.123456Z")).toBe("2026-10-24T10:15:56.123456Z");
    expect(csvCell(null)).toBe("");
  });

  it("quotes commas, quotes and line breaks, doubling inner quotes (RFC 4180)", () => {
    expect(csvCell("Kessler, Dana")).toBe('"Kessler, Dana"');
    expect(csvCell('Reason: "it is a bun"')).toBe('"Reason: ""it is a bun"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
  });

  it("defuses cells a spreadsheet would run as formulas", () => {
    expect(csvCell("=HYPERLINK(\"https://evil.test\")")).toBe("\"'=HYPERLINK(\"\"https://evil.test\"\")\"");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});

describe("toAuditCsv", () => {
  const events: AuditEvent[] = [
    {
      event: "uploaded",
      actor: "Dana Kessler · Web console",
      detail: "dog.jpg received from Dana Kessler via Web console.",
      occurredAt: "2026-10-24T10:15:56.123456Z",
      hash: "a1",
      prevHash: null,
    },
    {
      event: "appeal_filed",
      actor: "Dana Kessler · Web console",
      detail: 'Human review requested. Reason: "Bun, sausage, mustard."',
      occurredAt: "2026-10-24T10:20:00.000000Z",
      hash: "b2",
      prevHash: "a1",
    },
  ];

  it("writes a BOM, the header and one CRLF-terminated row per event", () => {
    expect(toAuditCsv(events)).toBe(
      "﻿occurred_at,event,actor,detail,hash,prev_hash\r\n" +
        "2026-10-24T10:15:56.123456Z,uploaded,Dana Kessler · Web console,dog.jpg received from Dana Kessler via Web console.,a1,\r\n" +
        '2026-10-24T10:20:00.000000Z,appeal_filed,Dana Kessler · Web console,"Human review requested. Reason: ""Bun, sausage, mustard.""",b2,a1\r\n',
    );
  });

  it("is just the header for an empty trail", () => {
    expect(toAuditCsv([])).toBe("﻿occurred_at,event,actor,detail,hash,prev_hash\r\n");
  });
});
