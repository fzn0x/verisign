import { X } from "lucide-react";
import { useToasts } from "../stores/toast";
import styles from "./Toaster.module.css";

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast} data-tone={t.tone}>
          <span>{t.message}</span>
          <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
