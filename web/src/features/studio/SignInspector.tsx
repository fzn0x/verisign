import { ArrowUpRight, FilePlus2, TriangleAlert } from "lucide-react";
import { useRef } from "react";
import { Button } from "../../components/Button";
import { CopyButton } from "../../components/CopyButton";
import { TextField } from "../../components/Field";
import { HashRegister } from "../../components/HashRegister";
import { StatusLabel, StatusMark } from "../../components/StatusMark";
import { formatBytes, plural } from "../../lib/format";
import { PT_PER_MM, STAMP_MAX_MM, STAMP_MIN_MM } from "../../lib/stamp";
import type { Issuer } from "../../lib/types";
import { downloadPdf, stampFootprint, useSigning, type Anchor, type IssueStep } from "../../stores/signing";
import styles from "./Sign.module.css";

const ANCHORS: Anchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const STEPS: { key: IssueStep; label: string }[] = [
  { key: "reserve", label: "Reserve a serial" },
  { key: "stamp", label: "Stamp the PDF in this browser" },
  { key: "hash", label: "Compute its SHA-512 fingerprint" },
  { key: "record", label: "Record the fingerprint" },
];

export function SignInspector({ issuer }: { issuer: Issuer }) {
  const s = useSigning();
  const fileInput = useRef<HTMLInputElement>(null);

  if (s.phase === "done" && s.result) {
    return <Issued />;
  }

  const box = s.pages[s.page - 1];
  const { w, h } = stampFootprint(s, issuer);
  const issuing = s.phase === "issuing";
  const leftMm = box ? Math.round((s.x * box.width) / PT_PER_MM) : 0;
  const topMm = box ? Math.round((s.y * box.height) / PT_PER_MM) : 0;

  function setMm(axis: "x" | "y", mm: number) {
    if (!box || Number.isNaN(mm)) return;
    if (axis === "x") s.moveTo((mm * PT_PER_MM) / box.width, s.y, issuer);
    else s.moveTo(s.x, (mm * PT_PER_MM) / box.height, issuer);
  }

  return (
    <div className={styles.inspector}>
      <section className={styles.group} aria-labelledby="doc-heading">
        <h2 id="doc-heading" className={styles.groupTitle}>
          Document
        </h2>
        <div className={styles.fileLine}>
          <span className={styles.fileName}>{s.file?.name}</span>
          <span className={styles.fileMeta}>
            {plural(s.pages.length, "page")} · {formatBytes(s.file?.size ?? 0)}
          </span>
          <button type="button" className={styles.textButton} onClick={() => fileInput.current?.click()} disabled={issuing}>
            Choose another
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) s.load(f);
            }}
          />
        </div>
        <TextField
          label="Title on the verification page"
          value={s.title}
          maxLength={160}
          onChange={(e) => s.setTitle(e.target.value)}
          disabled={issuing}
        />
        {s.alreadySigned ? (
          <p className={styles.warning}>
            <TriangleAlert size={15} aria-hidden />
            <span>This PDF already carries a digital signature. Adding the stamp changes the file, so that signature will no longer validate.</span>
          </p>
        ) : null}
      </section>

      <section className={styles.group} aria-labelledby="stamp-heading">
        <h2 id="stamp-heading" className={styles.groupTitle}>
          Stamp
        </h2>

        <div className={styles.control}>
          <label className={styles.controlLabel} htmlFor="stamp-page">
            Page
          </label>
          <select id="stamp-page" className={styles.select} value={s.page} onChange={(e) => s.setPage(Number(e.target.value))} disabled={issuing}>
            {s.pages.map((_, i) => (
              <option key={i} value={i + 1}>
                Page {i + 1}
                {i === 0 ? " (first)" : i === s.pages.length - 1 ? " (last)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.control}>
          <div className={styles.controlRow}>
            <label className={styles.controlLabel} htmlFor="stamp-size">
              QR code size
            </label>
            <output className={styles.readout} htmlFor="stamp-size">
              {s.sizeMm} mm
            </output>
          </div>
          <input
            id="stamp-size"
            className={styles.range}
            type="range"
            min={STAMP_MIN_MM}
            max={STAMP_MAX_MM}
            step={1}
            value={s.sizeMm}
            onChange={(e) => s.setSize(Number(e.target.value), issuer)}
            disabled={issuing}
          />
          <p className={styles.help}>18 mm or more scans reliably from print.</p>
        </div>

        <div className={styles.control}>
          <span className={styles.controlLabel} id="anchor-label">
            Position
          </span>
          <div className={styles.position}>
            <div className={styles.anchors} role="group" aria-labelledby="anchor-label">
              {ANCHORS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={styles.anchor}
                  onClick={() => s.anchor(a, issuer)}
                  disabled={issuing}
                  aria-label={`Move to ${a.replace("-", " ")}`}
                >
                  <span aria-hidden />
                </button>
              ))}
            </div>
            <div className={styles.mmInputs}>
              <label className={styles.mmField}>
                <span>From left</span>
                <span className={styles.mmBox}>
                  <input type="number" inputMode="numeric" min={0} max={box ? Math.floor(((1 - w) * box.width) / PT_PER_MM) : 0} value={leftMm} onChange={(e) => setMm("x", e.target.valueAsNumber)} disabled={issuing} />
                  <span>mm</span>
                </span>
              </label>
              <label className={styles.mmField}>
                <span>From top</span>
                <span className={styles.mmBox}>
                  <input type="number" inputMode="numeric" min={0} max={box ? Math.floor(((1 - h) * box.height) / PT_PER_MM) : 0} value={topMm} onChange={(e) => setMm("y", e.target.valueAsNumber)} disabled={issuing} />
                  <span>mm</span>
                </span>
              </label>
            </div>
          </div>
          <p className={styles.help}>Drag the stamp on the page, or select it and use the arrow keys.</p>
        </div>

        <label className={styles.switchRow}>
          <input type="checkbox" role="switch" checked={s.caption} onChange={(e) => s.setCaption(e.target.checked, issuer)} disabled={issuing} />
          <span className={styles.switch} aria-hidden />
          <span>
            <span className={styles.switchLabel}>Print issuer and serial</span>
            <span className={styles.help}>Lets people verify by typing the serial when the code is damaged.</span>
          </span>
        </label>
      </section>

      <section className={styles.issue} aria-label="Issue">
        {issuing ? (
          <ol className={styles.steps} aria-live="polite">
            {STEPS.map((step, i) => {
              const current = STEPS.findIndex((x) => x.key === s.step);
              const state = i < current ? "match" : i === current ? "pending" : "idle";
              return (
                <li key={step.key} data-state={state}>
                  <StatusMark kind={state} size={14} />
                  <span>{step.label}</span>
                </li>
              );
            })}
          </ol>
        ) : null}
        {s.error ? (
          <p className={styles.issueError} role="alert">
            {s.error}
          </p>
        ) : null}
        <Button variant="primary" ring block loading={issuing} onClick={() => s.issue()}>
          {s.unrecorded ? "Record fingerprint again" : "Issue and download"}
        </Button>
        <p className={styles.help}>
          The PDF never leaves this browser. Only its title, file name, page count and SHA-512 fingerprint are sent.
        </p>
      </section>
    </div>
  );
}

function Issued() {
  const result = useSigning((s) => s.result)!;
  const reset = useSigning((s) => s.reset);
  const { doc } = result;
  return (
    <div className={styles.inspector}>
      <section className={styles.done} aria-live="polite">
        <StatusLabel kind="issued" />
        <h2 className={styles.doneTitle}>
          Issued <span className="mono">{doc.serial}</span>
        </h2>
        <p className={styles.doneText}>
          Saved as <strong>{result.fileName}</strong>. Anyone holding this exact file can now confirm it at its verification
          page.
        </p>
        <HashRegister supplied={result.sha512} result="match" suppliedLabel="Recorded fingerprint" />
        <div className={styles.doneActions}>
          <Button variant="primary" ring block onClick={() => downloadPdf(result.bytes, result.fileName)}>
            Download again
          </Button>
          <div className={styles.doneRow}>
            <a className={styles.secondaryLink} href={`/v/${doc.id}`} target="_blank" rel="noopener">
              <ArrowUpRight size={15} aria-hidden />
              Open verification page
            </a>
            <CopyButton value={doc.verifyUrl} label="Copy link" copiedMessage="Verification link copied" variant="secondary" />
          </div>
          <Button variant="quiet" icon={<FilePlus2 size={15} aria-hidden />} onClick={reset}>
            Sign another PDF
          </Button>
        </div>
      </section>
    </div>
  );
}
