/** Length of a hex-encoded SHA-512 digest. */
export const SHA512_HEX_LENGTH = 128;

/** Characters per group in the hash register: 8 groups of 16. */
export const GROUP_SIZE = 16;

export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

/** SHA-512 of raw bytes, computed on this device with Web Crypto. */
export async function sha512(data: BufferSource): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-512", data));
}

/** SHA-512 of a file the visitor chose. The file never leaves the browser. */
export async function sha512File(file: Blob): Promise<string> {
  return sha512(await file.arrayBuffer());
}

/**
 * Normalises pasted digest text. Whole tool output is accepted: a
 * 128-character run is picked out of `shasum`, `certutil` or `Get-FileHash`
 * output, and digests split by spaces or line breaks are joined.
 */
export function normalizeDigest(raw: string): string {
  const embedded = raw.match(/(?:^|[^0-9a-fA-F])([0-9a-fA-F]{128})(?![0-9a-fA-F])/);
  if (embedded?.[1]) {
    return embedded[1].toLowerCase();
  }
  return raw.replace(/\s+/g, "").toLowerCase();
}

export type DigestProblem = "empty" | "not-hex" | "too-short" | "too-long";

export function digestProblem(hex: string): DigestProblem | null {
  if (hex.length === 0) return "empty";
  if (!/^[0-9a-f]*$/.test(hex)) return "not-hex";
  if (hex.length < SHA512_HEX_LENGTH) return "too-short";
  if (hex.length > SHA512_HEX_LENGTH) return "too-long";
  return null;
}

/** Splits a digest into register rows. */
export function groups(hex: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < hex.length; i += GROUP_SIZE) {
    out.push(hex.slice(i, i + GROUP_SIZE));
  }
  return out;
}
