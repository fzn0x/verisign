import type { DocumentStatus } from "../lib/types";
import styles from "./StatusMark.module.css";

export type MarkKind = DocumentStatus | "match" | "mismatch" | "idle";

/**
 * State is carried by line form first and colour second: a solid ring for
 * a valid state, dashed for incomplete, struck through for revoked or a
 * mismatch. The word always accompanies the mark.
 */
export function StatusMark({ kind, size = 16 }: { kind: MarkKind; size?: number }) {
  return (
    <svg className={`${styles.mark} ${styles[kind]}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden focusable="false">
      <circle className={styles.ring} cx="8" cy="8" r="6" />
      {kind === "issued" || kind === "match" ? <circle className={styles.core} cx="8" cy="8" r="2" /> : null}
      {kind === "revoked" || kind === "mismatch" ? <path className={styles.strike} d="M3.2 12.8 12.8 3.2" /> : null}
    </svg>
  );
}

const LABELS: Record<MarkKind, string> = {
  issued: "Issued",
  pending: "Incomplete",
  revoked: "Revoked",
  match: "Matches",
  mismatch: "No match",
  idle: "Not checked",
};

export function StatusLabel({ kind, label }: { kind: MarkKind; label?: string }) {
  return (
    <span className={`${styles.label} ${styles[`text-${kind}`] ?? ""}`}>
      <StatusMark kind={kind} size={14} />
      {label ?? LABELS[kind]}
    </span>
  );
}
