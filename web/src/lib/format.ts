const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
const shortDateFormat = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" });

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : "—";
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : "—";
}

export function formatShortDate(iso: string | null | undefined): string {
  return iso ? shortDateFormat.format(new Date(iso)) : "—";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["bytes", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The domain part of an origin or URL, for showing where a page is served from. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Formats a canonical 12-character ID as K7Q4-M2XD-9PRA. */
export function serialOf(id: string): string {
  return id.length === 12 ? `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}` : id;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Mirrors the server's ID normalisation so typed serials resolve. */
export function normalizeSerial(raw: string): string | null {
  let out = "";
  for (let ch of raw.toUpperCase()) {
    if (ch === "-" || /\s/.test(ch)) continue;
    if (ch === "O") ch = "0";
    if (ch === "I" || ch === "L") ch = "1";
    if (!CROCKFORD.includes(ch)) return null;
    out += ch;
  }
  return out.length === 12 ? out : null;
}
