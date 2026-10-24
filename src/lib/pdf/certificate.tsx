import "server-only";
import type { ComponentType, ReactNode } from "react";
import {
  Circle,
  Document,
  Font,
  G,
  Link,
  Page,
  Path,
  Rect,
  renderToBuffer,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatClause, getClause, POLICY_ENGINE, POLICY_VERSION, ratingBand } from "@/lib/policy";
import { qrMatrix, qrSvgPath, verifyUrl } from "@/lib/qr";
import { CERTIFICATE_DISCLAIMER, type PublicCertificate } from "@/lib/types";

// Certificate of Classification (docs/design/boards/Final-Certificate.dc.html) on one A4 page.
// The board is drawn at 96 dpi (794 x 1123 px); PDF units are points, so every board value goes
// through px(). Fonts are the PDF standard set (no files to load or bundle): Helvetica stands in
// for Source Sans 3, Times for Source Serif 4, Courier for the monospace codes.

const px = (value: number) => value * 0.75;

const NAVY = "#0B1F3A";
const NAVY_RULE = "#3A5175";
const MUSTARD = "#F2B705";
const WHITE = "#FFFFFF";
const GROUND = "#F3F5F8";
const HAIRLINE = "#D9DEE5";
const BODY = "#3F4A5A";
const SECONDARY = "#5B6676";
const ON_NAVY_SECONDARY = "#B8C2D1";
const ON_NAVY_SUB = "#D5DCE6";

const SANS = "Helvetica";
const SERIF = "Times-Roman";
const MONO = "Courier";

// Certificates print codes, URLs and SKUs: never hyphenate a word to wrap it.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { padding: px(40), backgroundColor: WHITE, fontFamily: SANS, fontSize: px(15), color: BODY },
  outerFrame: { flexGrow: 1, padding: px(4), borderWidth: px(1), borderColor: NAVY, borderRadius: px(2) },
  innerFrame: { flexGrow: 1, flexDirection: "column", borderWidth: px(1), borderColor: HAIRLINE },

  header: {
    height: px(68),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: px(26),
    backgroundColor: NAVY,
  },
  brand: { flexDirection: "row", alignItems: "center" },
  wordmark: { marginLeft: px(12), fontFamily: SERIF, fontWeight: 700, fontSize: px(26), letterSpacing: px(1), color: WHITE },
  brandRule: { width: px(1), height: px(32), marginHorizontal: px(12), backgroundColor: NAVY_RULE },
  brandName: { fontSize: px(13), fontWeight: 700, color: WHITE, lineHeight: 1.25 },
  brandTag: { fontSize: px(13), color: ON_NAVY_SECONDARY, lineHeight: 1.25 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  sampleChip: {
    marginRight: px(16),
    paddingHorizontal: px(8),
    paddingVertical: px(3),
    borderRadius: px(4),
    backgroundColor: MUSTARD,
    fontSize: px(12),
    fontWeight: 700,
    letterSpacing: px(1.5),
    color: NAVY,
  },
  headerMeta: { alignItems: "flex-end" },
  headerNumber: { fontSize: px(13), color: ON_NAVY_SECONDARY },
  headerNumberValue: { fontFamily: MONO, fontWeight: 700, color: WHITE },
  headerIssued: { marginTop: px(2), fontSize: px(13), color: ON_NAVY_SUB },

  main: { paddingTop: px(20), paddingHorizontal: px(26) },
  eyebrow: {
    fontSize: px(12),
    fontWeight: 700,
    letterSpacing: px(1.9),
    textTransform: "uppercase",
    textAlign: "center",
    color: SECONDARY,
  },
  title: {
    marginTop: px(4),
    fontFamily: SERIF,
    fontWeight: 700,
    fontSize: px(34),
    lineHeight: 36 / 34,
    textAlign: "center",
    color: NAVY,
  },
  issuedTo: { marginTop: px(8), fontSize: px(15), lineHeight: 22 / 15, textAlign: "center", color: BODY },
  strong: { fontWeight: 700, color: NAVY },

  band: {
    marginTop: px(16),
    height: px(76),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: px(24),
    borderRadius: px(6),
  },
  bandSide: { width: px(116), flexShrink: 0 },
  bandLabel: { fontSize: px(12), fontWeight: 700, letterSpacing: px(1.7), textTransform: "uppercase" },
  bandSub: { marginTop: px(2), fontSize: px(13), fontWeight: 700 },
  bandMiddle: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  bandWord: { fontFamily: SERIF, fontWeight: 700, fontSize: px(48), textAlign: "center" },
  finalChip: {
    flexDirection: "row",
    alignItems: "center",
    height: px(22),
    paddingHorizontal: px(6),
    borderWidth: px(2),
    borderRadius: px(4),
  },
  finalChipText: { marginLeft: px(4), fontSize: px(12), fontWeight: 700, letterSpacing: px(1.2), textTransform: "uppercase" },
  smallChip: {
    paddingHorizontal: px(6),
    paddingVertical: px(2),
    borderRadius: px(4),
    fontSize: px(12),
    fontWeight: 700,
    letterSpacing: px(1),
  },

  columns: { flexDirection: "row", alignItems: "stretch", marginTop: px(18) },
  record: { flexGrow: 1, flexShrink: 1, flexBasis: 0, borderWidth: px(1), borderColor: HAIRLINE, borderRadius: px(6) },
  sectionTitle: {
    fontSize: px(12),
    fontWeight: 700,
    letterSpacing: px(1.4),
    textTransform: "uppercase",
    color: SECONDARY,
  },
  recordTitle: { paddingVertical: px(8), paddingHorizontal: px(12) },
  row: { flexDirection: "row", paddingVertical: px(4), paddingHorizontal: px(12), borderTopWidth: px(1), borderTopColor: HAIRLINE },
  rowLabel: { width: px(120), flexShrink: 0, marginRight: px(12), fontSize: px(13), fontWeight: 700, lineHeight: 20 / 13, color: SECONDARY },
  rowValueCell: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  rowValue: { fontSize: px(14), lineHeight: 20 / 14, color: NAVY },
  rowValueMono: { fontFamily: MONO, fontSize: px(13) },
  rowNote: { marginTop: px(2), fontSize: px(13), lineHeight: 18 / 13, color: BODY },

  verify: {
    width: px(236),
    flexShrink: 0,
    marginLeft: px(24),
    padding: px(12),
    borderWidth: px(1),
    borderColor: HAIRLINE,
    borderRadius: px(6),
    alignItems: "center",
  },
  qr: { marginTop: px(10) },
  verifyCode: { marginTop: px(10), fontFamily: MONO, fontWeight: 700, fontSize: px(18), letterSpacing: px(1), color: NAVY },
  verifyUrl: { marginTop: px(2), alignItems: "center", textDecoration: "none" },
  verifyUrlLine: { fontSize: px(13), fontWeight: 700, lineHeight: 18 / 13, textAlign: "center", color: NAVY },
  verifyHelp: { marginTop: px(6), fontSize: px(12), lineHeight: 17 / 12, textAlign: "center", color: BODY },

  determination: { marginTop: px(16) },
  determinationText: { marginTop: px(6), fontSize: px(14), lineHeight: 21 / 14, color: BODY },

  signatures: { flexDirection: "row", alignItems: "flex-end", marginTop: px(18) },
  signature: { flexGrow: 1, flexShrink: 1, marginLeft: px(32) },
  signatureLine: { paddingTop: px(6), borderTopWidth: px(1), borderTopColor: NAVY },
  signatureName: { fontSize: px(15), fontWeight: 700, lineHeight: 20 / 15, color: NAVY },
  signatureRole: { fontSize: px(13), lineHeight: 18 / 13, color: SECONDARY },
  issueDateBlock: { width: px(168), flexShrink: 0, marginLeft: px(32) },
  issueDate: { marginBottom: px(12), fontFamily: SERIF, fontWeight: 700, fontSize: px(20), lineHeight: 26 / 20, color: NAVY },

  footer: {
    marginTop: "auto",
    marginHorizontal: px(26),
    paddingTop: px(12),
    paddingBottom: px(16),
    borderTopWidth: px(1),
    borderTopColor: HAIRLINE,
  },
  footerText: { fontSize: px(12), lineHeight: 18 / 12, color: SECONDARY },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: px(6) },

  watermark: {
    position: "absolute",
    top: px(470),
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: SANS,
    fontWeight: 700,
    fontSize: px(150),
    letterSpacing: px(12),
    color: NAVY,
    opacity: 0.07,
    transform: "rotate(-28deg)",
  },
});

// react-pdf supports font props on <Text> inside <Svg> at runtime, but its types omit them.
interface SvgTextProps {
  x: number;
  y: number;
  fill: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;
  letterSpacing?: number;
  textAnchor?: "start" | "middle" | "end";
  transform?: string;
  children: ReactNode;
}
const SvgText = Text as unknown as ComponentType<SvgTextProps>;

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${dateFormat.format(date)} · ${timeFormat.format(date)} UTC`;
}

/** 0.992 -> "99.2%". Floored, so 0.9996 never prints as a perfect 100.0%. */
export function formatConfidence(confidence: number): string {
  const clamped = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
  return `${(Math.floor(clamped * 1000) / 10).toFixed(1)}%`;
}

const verdictWord = (cert: PublicCertificate) => (cert.verdict === "hot_dog" ? "HOT DOG" : "NOT HOT DOG");

// Budgets that keep the worst case (longest names, notes and reasons the DB allows) on one page.
const ISSUED_TO_MAX = 80; // company names are capped at 80; issued_to allows 120
const RATING_NOTE_MAX = 90;
const REVOKED_REASON_MAX = 180;

/** Shortens free text the layout has a fixed budget for. The verify page shows it in full. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The legal-sounding paragraph under the record, built from the verdict and its clause. */
export function determinationText(cert: PublicCertificate): { lead: string; finding: string; tail: string } {
  const clause = getClause(cert.policyClause);
  const ref = clause ? ` under §${clause.id} (${clause.title})` : ` under §${cert.policyClause}`;
  const revoked = cert.status === "revoked";
  const lead = `Having examined the submitted image under Hot Dog Definition Policy v${POLICY_VERSION}, the HDX Classification Authority ${revoked ? "determined" : "determines"} that it is `;
  const finding = cert.verdict === "hot_dog" ? "a hot dog" : "not a hot dog";
  if (revoked) {
    const when = cert.revokedAt ? ` on ${formatDate(cert.revokedAt)}` : "";
    const reason = cert.revokedReason?.trim() ? clip(cert.revokedReason.trim(), REVOKED_REASON_MAX) : null;
    const why = reason ? ` Reason: ${/[.!?…]$/.test(reason) ? reason : `${reason}.`}` : "";
    return {
      lead,
      finding,
      tail: `${ref}. That determination was withdrawn${when} after an appeal to the Hot Dog Review Board, and this certificate is revoked.${why}`,
    };
  }
  const rule = clause ? `: ${clause.rule.charAt(0).toLowerCase()}${clause.rule.slice(1)}` : ".";
  return { lead, finding, tail: `${ref}${rule} The determination is binary and final, subject to appeal.` };
}

function verifyLabel(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * Splits "seamflow-git-main.vercel.app/v/7KQ2-M9XD" into lines of at most `maxChars`, breaking
 * after "." or "-" in the host and never inside the path, so the code stays on one line.
 * (react-pdf can only break a word by inserting a hyphen, which would corrupt a URL.)
 */
export function wrapUrlLabel(label: string, maxChars = 26): string[] {
  const slash = label.indexOf("/");
  const host = slash === -1 ? label : label.slice(0, slash);
  const path = slash === -1 ? "" : label.slice(slash);
  const tokens = [...(host.match(/[^.-]+[.-]?|[.-]/g) ?? []), ...(path ? [path] : [])];
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (line && line.length + token.length > maxChars) {
      lines.push(line);
      line = "";
    }
    line += token;
  }
  if (line) lines.push(line);
  return lines;
}

function Logo() {
  return (
    <Svg width={px(36)} height={px(36)} viewBox="0 0 32 32">
      <Rect x={0.5} y={0.5} width={31} height={31} rx={6} fill={NAVY} stroke={NAVY_RULE} strokeWidth={1} />
      <Rect x={4} y={10} width={24} height={8} rx={4} fill={MUSTARD} />
      <Path d="M6 16H26V18.5C26 21.5 23.5 24 20.5 24H11.5C8.5 24 6 21.5 6 18.5Z" fill={WHITE} />
    </Svg>
  );
}

function Check({ color }: { color: string }) {
  return (
    <Svg width={px(12)} height={px(12)} viewBox="0 0 24 24">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function QrCode({ value, size }: { value: string; size: number }) {
  const matrix = qrMatrix(value);
  const quiet = 2; // plus the card's white padding, comfortably past the 4-module spec
  const extent = matrix.length + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${extent} ${extent}`} style={styles.qr}>
      <Rect x={0} y={0} width={extent} height={extent} fill={WHITE} />
      <G transform={`translate(${quiet}, ${quiet})`}>
        <Path d={qrSvgPath(matrix)} fill={NAVY} />
      </G>
    </Svg>
  );
}

// Helvetica-Bold advance widths (1/1000 em) for the seal's ring text, so letters sit evenly.
const SEAL_GLYPH_WIDTHS: Record<string, number> = {
  " ": 278, "·": 278, ".": 278, "2": 556, "3": 556, "0": 556, "1": 556, "4": 556, "5": 556, "6": 556,
  "7": 556, "8": 556, "9": 556, C: 722, D: 722, E: 667, F: 611, H: 722, I: 278, L: 611, O: 778,
  P: 667, R: 722, T: 611, V: 667, X: 667, Y: 667,
};
const SEAL_FONT_SIZE = 12;
const SEAL_LETTER_SPACING = 0.5;

/** One <text> per letter, rotated around the seal centre: react-pdf has no textPath. */
function RingText({ text, radius, side }: { text: string; radius: number; side: "top" | "bottom" }) {
  const advances = Array.from(text, (ch) => ((SEAL_GLYPH_WIDTHS[ch] ?? 667) / 1000) * SEAL_FONT_SIZE + SEAL_LETTER_SPACING);
  const total = advances.reduce((sum, a) => sum + a, 0);
  let offset = 0;
  return (
    <>
      {Array.from(text).map((ch, i) => {
        const center = offset + advances[i] / 2 - total / 2;
        offset += advances[i];
        const degrees = ((center / radius) * 180) / Math.PI;
        // Top text reads clockwise from the left; bottom text reads counter-clockwise, upright.
        const angle = side === "top" ? degrees : -degrees;
        const y = side === "top" ? 56 - radius : 56 + radius;
        return (
          <SvgText
            key={i}
            x={56}
            y={y}
            fill={WHITE}
            fontFamily={SANS}
            fontWeight={700}
            fontSize={SEAL_FONT_SIZE}
            textAnchor="middle"
            transform={`rotate(${angle.toFixed(2)}, 56, 56)`}
          >
            {ch}
          </SvgText>
        );
      })}
    </>
  );
}

function Seal({ year }: { year: string }) {
  return (
    <Svg width={px(112)} height={px(112)} viewBox="0 0 112 112">
      <Circle cx={56} cy={56} r={55} fill={WHITE} stroke={NAVY} strokeWidth={1.5} />
      <Circle cx={56} cy={56} r={51.5} fill={NAVY} />
      <Circle cx={56} cy={56} r={49.5} fill="none" stroke={MUSTARD} strokeWidth={1} />
      <RingText text="HDX · CERTIFIED" radius={39} side="top" />
      <RingText text={`POLICY V${POLICY_VERSION}`} radius={47} side="bottom" />
      <Circle cx={13} cy={56} r={2} fill={MUSTARD} />
      <Circle cx={99} cy={56} r={2} fill={MUSTARD} />
      <Circle cx={56} cy={56} r={34} fill={MUSTARD} />
      <Circle cx={56} cy={56} r={30.5} fill="none" stroke={NAVY} strokeWidth={1} />
      <SvgText x={56} y={61} fill={NAVY} fontFamily={SERIF} fontWeight={700} fontSize={22} textAnchor="middle">
        HDX
      </SvgText>
      <Path d="M44 66.5H68" stroke={NAVY} strokeWidth={1} fill="none" />
      <SvgText x={56} y={79} fill={NAVY} fontFamily={SANS} fontWeight={700} fontSize={12} textAnchor="middle">
        {year}
      </SvgText>
    </Svg>
  );
}

function SignatureMark() {
  return (
    <Svg width={px(210)} height={px(46)} viewBox="0 0 210 46">
      <Path
        d="M8 33C12 20 18 9 24 11C30 13 23 33 18 35C13 37 26 17 34 15C40 14 36 29 41 29C45 29 47 17 53 17C58 17 55 29 60 29C65 29 68 15 74 15C79 15 76 29 81 29C88 29 93 11 99 13C104 15 97 31 103 31C109 31 113 19 119 19C124 19 122 29 127 29C133 29 137 21 143 21C148 21 147 28 152 28C159 28 165 23 171 21"
        stroke={NAVY}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M36 40C86 36 146 37 202 32" stroke={NAVY} strokeWidth={1.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function VerdictBand({ cert }: { cert: PublicCertificate }) {
  const clauseRef = `Policy v${POLICY_VERSION}, §${cert.policyClause}`;
  const hot = cert.verdict === "hot_dog";

  if (cert.status === "revoked") {
    return (
      <View style={[styles.band, { backgroundColor: WHITE, borderWidth: px(2), borderColor: NAVY }]}>
        <View style={styles.bandSide}>
          <Text style={[styles.bandLabel, { color: SECONDARY }]}>{cert.revokedAt ? "Revoked on" : "Status"}</Text>
          <Text style={[styles.bandSub, { color: NAVY }]}>{cert.revokedAt ? formatDate(cert.revokedAt) : "Revoked"}</Text>
        </View>
        <View style={styles.bandMiddle}>
          <Text style={[styles.bandWord, { color: NAVY, letterSpacing: px(2) }]}>REVOKED</Text>
        </View>
        <View style={[styles.bandSide, { alignItems: "flex-end" }]}>
          <Text style={[styles.bandLabel, { color: SECONDARY }]}>Was</Text>
          <Text
            style={[
              styles.smallChip,
              { marginTop: px(4) },
              hot ? { backgroundColor: MUSTARD, color: NAVY } : { backgroundColor: NAVY, color: WHITE },
            ]}
          >
            {verdictWord(cert)}
          </Text>
        </View>
      </View>
    );
  }

  const ink = hot ? NAVY : WHITE;
  return (
    <View style={[styles.band, { backgroundColor: hot ? MUSTARD : NAVY }]}>
      <View style={styles.bandSide}>
        <Text style={[styles.bandLabel, { color: hot ? NAVY : ON_NAVY_SECONDARY }]}>Verdict</Text>
        <Text style={[styles.bandSub, { color: ink }]}>{clauseRef}</Text>
      </View>
      <View style={styles.bandMiddle}>
        <Text style={[styles.bandWord, { color: ink }]}>{verdictWord(cert)}</Text>
      </View>
      <View style={[styles.bandSide, { alignItems: "flex-end" }]}>
        <View style={[styles.finalChip, { borderColor: ink }]}>
          <Check color={ink} />
          <Text style={[styles.finalChipText, { color: ink }]}>Final</Text>
        </View>
        <Text style={{ marginTop: px(4), fontSize: px(13), color: hot ? NAVY : ON_NAVY_SUB }}>Subject to appeal</Text>
      </View>
    </View>
  );
}

interface RecordRow {
  label: string;
  value: string;
  mono?: boolean;
  note?: string | null;
}

function recordRows(cert: PublicCertificate): RecordRow[] {
  const rows: RecordRow[] = [
    { label: "Certificate", value: cert.number, mono: true },
    { label: "Issued", value: formatDateTime(cert.issuedAt) },
    { label: "Confidence", value: formatConfidence(cert.confidence) },
    { label: "Policy clause", value: formatClause(cert.policyClause) },
  ];
  if (cert.verdict === "hot_dog" && cert.rating !== null) {
    const band = ratingBand(cert.rating);
    rows.push({
      label: "HDX Rating",
      value: `${cert.rating} / 100 · ${band.charAt(0).toUpperCase()}${band.slice(1)}`,
      note: cert.ratingNote ? clip(cert.ratingNote, RATING_NOTE_MAX) : null,
    });
  }
  rows.push(
    { label: "Image fingerprint", value: cert.fingerprint ? `SHA-256 · ${cert.fingerprint}` : "Not recorded", mono: Boolean(cert.fingerprint) },
    { label: "Model", value: cert.model ? `${cert.model} · ${POLICY_ENGINE}` : POLICY_ENGINE, mono: true },
  );
  return rows;
}

function IssuedToLine({ cert }: { cert: PublicCertificate }) {
  return (
    <Text style={styles.issuedTo}>
      Issued to <Text style={styles.strong}>{clip(cert.issuedTo, ISSUED_TO_MAX)}</Text>
      {cert.productName ? (
        <>
          {" for "}
          <Text style={styles.strong}>{cert.productName}</Text>
        </>
      ) : (
        " for the submitted image"
      )}
      {cert.sku ? ` · SKU ${cert.sku}` : ""}
    </Text>
  );
}

function CertificateDocument({ cert, origin }: { cert: PublicCertificate; origin: string }) {
  const url = verifyUrl(origin, cert.code);
  const host = verifyLabel(origin.replace(/\/+$/, ""));
  const issued = formatDate(cert.issuedAt);
  const issuedDate = new Date(cert.issuedAt);
  const issuedTime = Number.isNaN(issuedDate.getTime()) ? "UTC" : `${timeFormat.format(issuedDate)} UTC`;
  const year = String(new Date(cert.issuedAt).getUTCFullYear() || new Date().getUTCFullYear());
  const determination = determinationText(cert);
  const revoked = cert.status === "revoked";
  const rows = recordRows(cert);

  return (
    <Document
      title={`HDX Certificate ${cert.number}`}
      author="HDX Classification Authority"
      subject={`Certificate of Classification ${cert.number}: ${revoked ? "REVOKED" : verdictWord(cert)}`}
      creator="HDX"
      producer="HDX"
      language="en"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.outerFrame}>
          <View style={styles.innerFrame}>
            <View style={styles.header}>
              <View style={styles.brand}>
                <Logo />
                <Text style={styles.wordmark}>HDX</Text>
                <View style={styles.brandRule} />
                <View>
                  <Text style={styles.brandName}>Hot Dog or Not</Text>
                  <Text style={styles.brandTag}>Enterprise Cloud</Text>
                </View>
              </View>
              <View style={styles.headerRight}>
                {cert.isSample ? <Text style={styles.sampleChip}>SAMPLE</Text> : null}
                <View style={styles.headerMeta}>
                  <Text style={styles.headerNumber}>
                    Certificate No. <Text style={styles.headerNumberValue}>{cert.number}</Text>
                  </Text>
                  <Text style={styles.headerIssued}>Issued {formatDateTime(cert.issuedAt)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.main}>
              <Text style={styles.eyebrow}>{cert.isSample ? "HDX Classification Authority · Sample record" : "HDX Classification Authority"}</Text>
              <Text style={styles.title}>Certificate of Classification</Text>
              <IssuedToLine cert={cert} />

              <VerdictBand cert={cert} />

              <View style={styles.columns}>
                <View style={styles.record}>
                  <Text style={[styles.sectionTitle, styles.recordTitle]}>Classification record</Text>
                  {rows.map((row, i) => (
                    <View key={row.label} style={[styles.row, { backgroundColor: i % 2 === 0 ? GROUND : WHITE }]}>
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      <View style={styles.rowValueCell}>
                        <Text style={row.mono ? [styles.rowValue, styles.rowValueMono] : styles.rowValue}>{row.value}</Text>
                        {row.note ? <Text style={styles.rowNote}>{row.note}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.verify}>
                  <Text style={styles.sectionTitle}>Verification</Text>
                  <QrCode value={url} size={px(132)} />
                  <Text style={styles.verifyCode}>{cert.code}</Text>
                  <Link src={url} style={styles.verifyUrl}>
                    {wrapUrlLabel(verifyLabel(url)).map((line) => (
                      <Text key={line} style={styles.verifyUrlLine}>
                        {line}
                      </Text>
                    ))}
                  </Link>
                  <Text style={styles.verifyHelp}>
                    Scan to check current status. Certificates can be revoked after an appeal.
                  </Text>
                </View>
              </View>

              <View style={styles.determination}>
                <Text style={styles.sectionTitle}>Determination</Text>
                <Text style={styles.determinationText}>
                  {determination.lead}
                  <Text style={styles.strong}>{determination.finding}</Text>
                  {determination.tail}
                </Text>
              </View>

              <View style={styles.signatures}>
                <Seal year={year} />
                <View style={styles.signature}>
                  <SignatureMark />
                  <View style={styles.signatureLine}>
                    <Text style={styles.signatureName}>Hot Dog Review Board</Text>
                    <Text style={styles.signatureRole}>Chief Classification Officer</Text>
                  </View>
                </View>
                <View style={styles.issueDateBlock}>
                  <Text style={styles.issueDate}>{issued}</Text>
                  <View style={styles.signatureLine}>
                    <Text style={styles.signatureName}>Date of issue</Text>
                    <Text style={styles.signatureRole}>{issuedTime}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{CERTIFICATE_DISCLAIMER}</Text>
              {cert.isSample ? (
                <Text style={[styles.footerText, { marginTop: px(4), fontWeight: 700, color: NAVY }]}>
                  Sample record for demonstration. It was not issued for a real product.
                </Text>
              ) : null}
              <View style={styles.footerRow}>
                <Text style={[styles.footerText, { flexGrow: 1, flexShrink: 1, flexBasis: 0, marginRight: px(16) }]}>
                  © {year} HDX Classification Systems, Inc. · {host}
                </Text>
                <Text style={[styles.footerText, { flexShrink: 0 }]}>Certificate {cert.number} · Page 1 of 1</Text>
              </View>
            </View>
          </View>
        </View>
        {cert.isSample ? <Text style={styles.watermark} fixed>SAMPLE</Text> : null}
      </Page>
    </Document>
  );
}

/** Renders the Certificate of Classification as a one-page A4 PDF. `origin` builds the QR's verify URL. */
export async function renderCertificatePdf(
  cert: PublicCertificate,
  opts: { origin: string },
): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await renderToBuffer(<CertificateDocument cert={cert} origin={opts.origin} />);
  // A plain copy: Buffer may sit on a shared pool, and Response wants an ArrayBuffer-backed view.
  return new Uint8Array(buffer);
}
