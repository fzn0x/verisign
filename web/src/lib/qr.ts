import { encode } from "uqr";

export interface QrCode {
  /** Modules per side, without quiet zone. */
  size: number;
  /** One SVG path of every dark module, in module units. */
  path: string;
}

/**
 * Encodes the verification URL. The URL is upper-cased first so the
 * encoder can use QR alphanumeric mode, which yields a smaller symbol with
 * larger modules for the same printed size. Hosts are case-insensitive and
 * the app resolves /V/ID like /v/id.
 */
export function verificationQr(verifyUrl: string): QrCode {
  const qr = encode(verifyUrl.toUpperCase(), { ecc: "M", boostEcc: true, border: 0 });
  return { size: qr.size, path: modulesPath(qr.data) };
}

/** Merges horizontal runs of dark modules into rectangles. */
function modulesPath(rows: boolean[][]): string {
  let d = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  return d;
}
