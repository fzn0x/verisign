import { FileText } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { formatBytes } from "../lib/format";
import styles from "./DropZone.module.css";

interface DropZoneProps {
  onFile: (file: File) => void;
  file?: File | null;
  busy?: boolean;
  title: ReactNode;
  hint?: ReactNode;
  /** Text for the button that opens the file picker. */
  action?: string;
  compact?: boolean;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function DropZone({ onFile, file, busy, title, hint, action = "Choose a PDF", compact }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    if (!isPdf(candidate)) {
      setRejected(`${candidate.name} is not a PDF.`);
      return;
    }
    setRejected(null);
    onFile(candidate);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    accept(event.dataTransfer.files[0]);
  }

  return (
    <div
      className={styles.zone}
      data-over={over || undefined}
      data-compact={compact || undefined}
      data-busy={busy || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
    >
      <FileText className={styles.icon} size={compact ? 20 : 24} strokeWidth={1.5} aria-hidden />
      <div className={styles.copy}>
        {file ? (
          <>
            <p className={styles.title}>{file.name}</p>
            <p className={styles.hint}>{formatBytes(file.size)}</p>
          </>
        ) : (
          <>
            <p className={styles.title}>{title}</p>
            {hint ? <p className={styles.hint}>{hint}</p> : null}
          </>
        )}
        {rejected ? (
          <p className={styles.rejected} role="alert">
            {rejected}
          </p>
        ) : null}
      </div>
      <button type="button" className={styles.pick} onClick={() => input.current?.click()} disabled={busy}>
        {file ? "Choose another" : action}
      </button>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
