import type { CSSProperties } from "react";
import { HdxMark } from "@/components/brand/hdx-mark";
import { QrCode } from "@/components/brand/qr-code";
import { formatDate } from "@/components/ui/format";
import { verifyUrl } from "@/lib/qr";
import { SHORT_DISCLAIMER, type CertificateSummary, type Verdict } from "@/lib/types";

type LabelSize = "large" | "medium" | "small";

const SIZES: Record<LabelSize, { w: number; h: number; qr: number; count: number; title: string; use: string }> = {
  large: { w: 60, h: 60, qr: 34, count: 3, title: "Large · 60 × 60 mm", use: "Packaging, boxes and sleeves" },
  medium: { w: 40, h: 40, qr: 22, count: 8, title: "Medium · 40 × 40 mm", use: "Menus, table tents and service windows" },
  small: { w: 25, h: 44, qr: 19, count: 4, title: "Small · 25 × 44 mm", use: "Trays and wrappers" },
};

function Label({
  size,
  url,
  shortUrl,
  verdict,
  number,
  code,
}: {
  size: LabelSize;
  url: string;
  shortUrl: string;
  verdict: Verdict;
  number: string;
  code: string;
}) {
  const s = SIZES[size];
  const hot = verdict === "hot_dog";
  const style: CSSProperties = { width: `${s.w}mm`, height: `${s.h}mm` };
  const titleSize = size === "large" ? "4mm" : size === "medium" ? "2.8mm" : "2.4mm";
  const metaSize = size === "large" ? "2.4mm" : size === "medium" ? "1.9mm" : "1.6mm";
  return (
    <li
      style={style}
      className="flex flex-col items-center justify-between overflow-hidden border border-dashed border-field bg-white p-[1.5mm] text-center text-navy"
    >
      <div className="flex items-center gap-[1mm]" style={{ fontSize: metaSize }}>
        <HdxMark size={size === "large" ? 14 : 10} />
        <span className="font-bold">HDX</span>
      </div>
      <p className="font-serif font-semibold leading-tight" style={{ fontSize: titleSize }}>
        {hot ? "Certified Hot Dog" : "Classified: Not Hot Dog"}
      </p>
      <QrCode value={url} size={`${s.qr}mm`} quietZone={1} label={`QR code for certificate ${number}, verification code ${code}`} />
      <div className="leading-tight" style={{ fontSize: metaSize }}>
        <p className="font-bold">Scan to verify</p>
        <p className="break-all font-mono">{shortUrl}</p>
      </div>
    </li>
  );
}

export function LabelSheet({
  origin,
  certificate,
  verdict,
}: {
  origin: string;
  certificate: CertificateSummary;
  verdict: Verdict;
}) {
  const url = verifyUrl(origin, certificate.code);
  const shortUrl = url.replace(/^https?:\/\//, "");
  const product = certificate.productName ?? "Unnamed product";
  return (
    <article
      aria-label="A4 label sheet"
      className="label-sheet mx-auto bg-white text-navy shadow-sm"
      style={{ width: "210mm", minHeight: "297mm", padding: "10mm" }}
    >
      <header className="border-b border-hairline pb-[3mm]">
        <p className="text-[2.6mm] font-semibold uppercase tracking-wide text-secondary">
          Label sheet · A4 portrait · Sheet 1 of 1
        </p>
        <h1 className="mt-[1mm] font-serif text-[5.5mm] font-semibold">
          QR labels — {product}
          {certificate.sku ? ` (SKU ${certificate.sku})` : ""}
        </h1>
        <p className="mt-[1mm] text-[3mm] text-body">
          Certificate <span className="font-mono">{certificate.number}</span> · Code{" "}
          <span className="font-mono">{certificate.code}</span> · Issued to {certificate.issuedTo},{" "}
          {formatDate(certificate.issuedAt)} ·{" "}
          <strong className={certificate.status === "revoked" ? "text-danger" : "text-status-green"}>
            {certificate.status === "revoked" ? "Revoked" : "Valid"}
          </strong>
        </p>
        <p className="mt-[1mm] text-[2.6mm] text-secondary">
          Print at 100% on A4 label stock. Do not scale. Each label verifies certificate {certificate.number}.
        </p>
      </header>

      {(Object.keys(SIZES) as LabelSize[]).map((size) => (
        <section key={size} className="mt-[4mm]" aria-label={SIZES[size].title}>
          <h2 className="text-[3mm] font-bold">
            {SIZES[size].title}{" "}
            <span className="font-normal text-secondary">
              · {SIZES[size].use} · {SIZES[size].count} per sheet
            </span>
          </h2>
          <ul className="mt-[2mm] flex flex-wrap gap-[4mm]">
            {Array.from({ length: SIZES[size].count }, (_, i) => (
              <Label
                key={i}
                size={size}
                url={url}
                shortUrl={shortUrl}
                verdict={verdict}
                number={certificate.number}
                code={certificate.code}
              />
            ))}
          </ul>
        </section>
      ))}

      <footer className="mt-[5mm] border-t border-hairline pt-[2mm] text-[2.4mm] text-secondary">
        <p>Cut along dashed lines. Labels stop verifying if the certificate is revoked.</p>
        <p>{SHORT_DISCLAIMER}</p>
      </footer>
    </article>
  );
}
