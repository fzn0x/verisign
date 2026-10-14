import type { CSSProperties } from "react";
import { groups } from "../lib/hash";
import styles from "./HashRegister.module.css";

export type RegisterResult = "match" | "mismatch" | "checking";

interface HashRegisterProps {
  supplied: string;
  /** Present only after a match; the server never discloses it otherwise. */
  recorded?: string;
  result: RegisterResult;
  /** Labels for the two columns. */
  recordedLabel?: string;
  suppliedLabel?: string;
}

/**
 * The proof beside the claim: both SHA-512 strings set in eight aligned
 * groups. On a match each group ticks in sequence; on a mismatch the
 * supplied string stands alone, struck.
 */
export function HashRegister({
  supplied,
  recorded,
  result,
  recordedLabel = "Recorded at issue",
  suppliedLabel = "Your file",
}: HashRegisterProps) {
  const yours = groups(supplied);
  const theirs = recorded ? groups(recorded) : [];
  const paired = result === "match" && theirs.length === yours.length;

  return (
    <figure className={styles.register} data-result={result} data-paired={paired || undefined}>
      <div className={styles.head} aria-hidden>
        <span />
        {paired ? <span>{recordedLabel}</span> : null}
        <span>{suppliedLabel}</span>
      </div>
      <ol className={styles.rows} aria-label={paired ? `${recordedLabel} and ${suppliedLabel.toLowerCase()}, in 8 groups` : suppliedLabel}>
        {yours.map((group, i) => (
          <li key={i} className={styles.row} style={{ "--i": i } as CSSProperties}>
            <svg className={styles.tick} viewBox="0 0 16 16" aria-hidden>
              <circle cx="8" cy="8" r="5.5" pathLength="1" />
            </svg>
            {paired ? <code className={styles.group}>{theirs[i]}</code> : null}
            <code className={`${styles.group} ${styles.yours}`}>{group}</code>
          </li>
        ))}
      </ol>
    </figure>
  );
}
