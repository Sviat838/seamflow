import QRCode from "qrcode";

/**
 * Dark/light modules for a QR code (quiet zone excluded). Error correction "M" survives
 * scuffed labels while keeping modules large enough to print at 25 mm.
 */
export function qrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = modules.size;
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(modules.get(y, x) === 1);
    rows.push(row);
  }
  return rows;
}

/** One SVG path (in module units, origin at the top-left module) covering every dark module. */
export function qrSvgPath(matrix: boolean[][]): string {
  let d = "";
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      // Merge horizontal runs so the path stays small.
      const start = x;
      while (x < row.length && row[x]) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  return d;
}

/** Public verification URL printed on certificates and labels. */
export function verifyUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/v/${code}`;
}
