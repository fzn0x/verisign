import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { DropZone } from "../../components/DropZone";
import { TextAreaField } from "../../components/Field";
import { HashRegister } from "../../components/HashRegister";
import { StatusLabel } from "../../components/StatusMark";
import { ApiError } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import { SHA512_HEX_LENGTH, digestProblem, normalizeDigest, sha512File } from "../../lib/hash";
import type { PublicDocument } from "../../lib/types";
import { useVerify } from "../../queries";
import styles from "./Verify.module.css";

const PROBLEMS = {
  empty: "Paste the file's SHA-512 fingerprint first.",
  "not-hex": "A SHA-512 fingerprint only contains the digits 0–9 and letters a–f.",
  "too-short": "That is shorter than a SHA-512 fingerprint, which has 128 characters. Check you copied all of it.",
  "too-long": "That is longer than a SHA-512 fingerprint, which has 128 characters.",
} as const;

interface IntegrityPanelProps {
  doc: PublicDocument;
  /** A digest computed on the home page, checked as soon as the panel mounts. */
  initialDigest?: string;
  initialFileName?: string;
}

export function IntegrityPanel({ doc, initialDigest, initialFileName }: IntegrityPanelProps) {
  const verify = useVerify(doc.id);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [checkedName, setCheckedName] = useState<string | null>(initialFileName ?? null);
  const [hashing, setHashing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [hashError, setHashError] = useState<string | null>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    if (initialDigest && !autoRan.current) {
      autoRan.current = true;
      verify.mutate(initialDigest);
    }
  }, [initialDigest, verify]);

  const normalized = normalizeDigest(text);
  const pending = doc.status === "pending";

  async function checkFile(chosen: File) {
    setFile(chosen);
    setProblem(null);
    setHashError(null);
    setHashing(true);
    try {
      const digest = await sha512File(chosen);
      setText(digest);
      setCheckedName(chosen.name);
      verify.mutate(digest);
    } catch {
      setHashError("This browser could not read the file. Try choosing it again.");
    } finally {
      setHashing(false);
    }
  }

  function checkText() {
    const issue = digestProblem(normalized);
    if (issue) {
      setProblem(PROBLEMS[issue]);
      return;
    }
    setProblem(null);
    setCheckedName(null);
    verify.mutate(normalized);
  }

  const result = verify.data;
  const busy = hashing || verify.isPending;

  return (
    <section className={styles.panel} aria-labelledby="integrity-title">
      <div className={styles.panelHead}>
        <h2 id="integrity-title" className={styles.panelTitle}>
          Check your copy
        </h2>
        <p className={styles.panelLead}>
          Confirm your PDF is byte-for-byte the file {doc.issuer.organization} issued. The fingerprint is computed on this
          device; the file is never uploaded.
        </p>
      </div>

      {pending ? (
        <p className={styles.notice}>
          This record was never completed by the issuer, so there is no fingerprint to compare against. Treat the document
          as unverified.
        </p>
      ) : (
        <>
          <DropZone
            onFile={checkFile}
            file={file}
            busy={busy}
            title="Drop the PDF here"
            hint="Or choose it from your device."
          />
          {hashError ? (
            <p className={styles.inlineError} role="alert">
              {hashError}
            </p>
          ) : null}

          <div className={styles.or} aria-hidden>
            <span>or paste its fingerprint</span>
          </div>

          <form
            className={styles.pasteForm}
            onSubmit={(e) => {
              e.preventDefault();
              checkText();
            }}
          >
            <TextAreaField
              label="SHA-512 fingerprint"
              aside={`${Math.min(normalized.length, 999)} / ${SHA512_HEX_LENGTH}`}
              mono
              rows={3}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              placeholder="e.g. 3f9a0c…"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setProblem(null);
              }}
              error={problem}
            />
            <Button type="submit" variant="primary" ring block loading={verify.isPending && !hashing}>
              Check fingerprint
            </Button>
          </form>

          <HowToHash />
        </>
      )}

      {verify.isError ? (
        <p className={styles.inlineError} role="alert">
          {verify.error instanceof ApiError ? verify.error.message : "The check could not be completed. Try again."}
        </p>
      ) : null}

      {(busy || result) && !verify.isError ? (
        <div className={styles.result} aria-live="polite">
          {result && !verify.isPending ? (
            <ResultStatement doc={doc} match={result.match} checkedAt={result.checkedAt} fileName={checkedName} />
          ) : (
            <p className={styles.checking}>{hashing ? "Computing the fingerprint on this device…" : "Comparing with the record…"}</p>
          )}
          <HashRegister
            supplied={result && !verify.isPending ? result.suppliedSha512 : normalized.padEnd(SHA512_HEX_LENGTH, "·").slice(0, SHA512_HEX_LENGTH)}
            recorded={result?.recordedSha512}
            result={result && !verify.isPending ? (result.match ? "match" : "mismatch") : "checking"}
            suppliedLabel={checkedName ? "Your file" : "Your fingerprint"}
          />
        </div>
      ) : null}
    </section>
  );
}

function ResultStatement({
  doc,
  match,
  checkedAt,
  fileName,
}: {
  doc: PublicDocument;
  match: boolean;
  checkedAt: string;
  fileName: string | null;
}) {
  const subject = fileName ? <strong className={styles.fileName}>{fileName}</strong> : "This fingerprint";
  if (match && doc.status === "revoked") {
    return (
      <div className={styles.statement}>
        <StatusLabel kind="revoked" label="Matches a revoked document" />
        <p>
          {subject} is the file that was issued, but {doc.issuer.organization} revoked it on {formatDate(doc.revokedAt)}. Do
          not rely on it.
        </p>
      </div>
    );
  }
  if (match) {
    return (
      <div className={styles.statement}>
        <StatusLabel kind="match" label="Matches the record" />
        <p>
          {subject} is identical to the file {doc.issuer.organization} issued. All 8 groups agree.{" "}
          <span className={styles.when}>Checked {formatDateTime(checkedAt)}.</span>
        </p>
      </div>
    );
  }
  return (
    <div className={styles.statement}>
      <StatusLabel kind="mismatch" label="Does not match" />
      <p>
        {subject} is not the file that was issued. Changing even one byte, including re-saving or printing to PDF, produces
        a different fingerprint. Ask {doc.issuer.organization} for the original.
      </p>
    </div>
  );
}

function HowToHash() {
  return (
    <details className={styles.howto}>
      <summary>
        How to get a file's SHA-512 fingerprint <ChevronDown size={14} aria-hidden />
      </summary>
      <dl className={styles.commands}>
        <dt>macOS, Linux</dt>
        <dd>
          <code>shasum -a 512 file.pdf</code>
        </dd>
        <dt>Windows PowerShell</dt>
        <dd>
          <code>Get-FileHash -Algorithm SHA512 file.pdf</code>
        </dd>
        <dt>Windows Command Prompt</dt>
        <dd>
          <code>certutil -hashfile file.pdf SHA512</code>
        </dd>
      </dl>
      <p className={styles.howtoNote}>Paste the whole output if you like; the fingerprint is picked out of it.</p>
    </details>
  );
}
