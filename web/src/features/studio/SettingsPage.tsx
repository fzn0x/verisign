import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { TextField } from "../../components/Field";
import { ApiError } from "../../lib/api";
import { layoutStamp, printable } from "../../lib/stamp";
import type { Issuer } from "../../lib/types";
import { useSaveIssuer, useStudioIssuer } from "../../queries";
import { PREVIEW_ID } from "../../stores/signing";
import { toast } from "../../stores/toast";
import shell from "./Studio.module.css";
import { StampPreview } from "./StampPreview";
import styles from "./Settings.module.css";

const EMPTY: Issuer = { organization: "", signatory: "", role: "", url: "" };

export function SettingsPage() {
  const query = useStudioIssuer();
  const save = useSaveIssuer();
  const [form, setForm] = useState<Issuer>(EMPTY);

  useEffect(() => {
    document.title = "Settings · Signing studio";
  }, []);

  useEffect(() => {
    if (query.data) {
      const { organization, signatory, role, url } = query.data;
      setForm({ organization, signatory, role, url });
    }
  }, [query.data]);

  const preview = useMemo(
    () =>
      layoutStamp(
        {
          verifyUrl: `${window.location.origin}/v/${PREVIEW_ID}`,
          id: PREVIEW_ID,
          issuer: { organization: form.organization || "Organisation", signatory: form.signatory || "Signatory" },
          caption: true,
        },
        22,
      ),
    [form.organization, form.signatory],
  );

  const err = save.error instanceof ApiError ? save.error : null;
  const fieldError = (field: keyof Issuer) => (err?.field === field ? err.message : null);
  const unprintable = printable(form.organization + form.signatory) !== form.organization + form.signatory;
  const set = (field: keyof Issuer) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    save.reset();
  };

  return (
    <div className={styles.page}>
      <header className={shell.header}>
        <div className={shell.headerText}>
          <h1 className={shell.title}>Settings</h1>
          <p className={shell.subtitle}>
            {query.data?.saved === false ? "Showing the defaults from the Worker configuration." : "Shown on every stamp and verification page."}
          </p>
        </div>
      </header>

      <div className={styles.layout}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form, { onSuccess: () => toast("Issuer details saved") });
          }}
        >
          <TextField label="Organisation" value={form.organization} onChange={set("organization")} required maxLength={120} error={fieldError("organization")} hint="Leads the verification page: “Issued by …”." />
          <TextField label="Signatory" value={form.signatory} onChange={set("signatory")} required maxLength={120} error={fieldError("signatory")} hint="The person who signs on the organisation’s behalf." />
          <TextField label="Role" value={form.role} onChange={set("role")} maxLength={120} error={fieldError("role")} hint="Optional, e.g. Editor or Director." />
          <TextField label="Website" type="url" value={form.url} onChange={set("url")} maxLength={200} placeholder="https://" error={fieldError("url")} hint="Optional. Linked from the organisation name." />
          {err && !err.field ? (
            <p className={styles.error} role="alert">
              {err.message}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button type="submit" variant="primary" ring loading={save.isPending} disabled={query.isPending}>
              Save details
            </Button>
          </div>
        </form>

        <aside className={styles.previewPanel} aria-label="Stamp preview">
          <p className={styles.previewTitle}>Stamp preview</p>
          <div className={styles.previewStamp} style={{ aspectRatio: `${preview.width} / ${preview.height}` }}>
            <StampPreview layout={preview} />
          </div>
          <p className={styles.previewNote}>
            Shown at 22 mm. Each document keeps the details that were saved when it was signed; changing them here does not
            alter documents already issued.
          </p>
          {unprintable ? (
            <p className={styles.previewNote}>
              Some characters cannot be printed with the PDF’s built-in font and appear as “?” on the stamp. The verification
              page shows them correctly.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
