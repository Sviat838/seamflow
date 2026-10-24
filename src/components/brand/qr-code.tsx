import { qrMatrix, qrSvgPath } from "@/lib/qr";

export interface QrCodeProps {
  /** Text to encode, usually verifyUrl(origin, code). */
  value: string;
  /** Accessible name, e.g. "QR code for certificate HDX-C-0088213, verification code 7KQ2-M9XD". */
  label: string;
  /** px number or any CSS length ("40mm"). Default 132. */
  size?: number | string;
  fg?: string;
  bg?: string;
  /** Light border in modules. The QR spec asks for 4. */
  quietZone?: number;
  className?: string;
}

/**
 * Real, scannable QR code as inline SVG. Server-render it: it pulls in the qrcode library,
 * so hand the rendered element to Client Components as children instead of importing it there.
 */
export function QrCode({ value, label, size = 132, fg = "#0B1F3A", bg = "#FFFFFF", quietZone = 4, className }: QrCodeProps) {
  const matrix = qrMatrix(value);
  const extent = matrix.length + quietZone * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className={className}
    >
      <rect width={extent} height={extent} fill={bg} />
      <path d={qrSvgPath(matrix)} fill={fg} transform={`translate(${quietZone} ${quietZone})`} />
    </svg>
  );
}
