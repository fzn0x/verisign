import { ArrowUpRight, Search } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, ButtonLink } from "../../components/Button";
import { CopyButton } from "../../components/CopyButton";
import { Dialog } from "../../components/Dialog";
import { TextAreaField } from "../../components/Field";
import { StatusLabel } from "../../components/StatusMark";
import { ApiError } from "../../lib/api";
import { formatShortDate, plural } from "../../lib/format";
import type { DocumentStatus, StudioDocument } from "../../lib/types";
import { useDiscard, useRevoke, useStudioDocuments, useStudioIssuer } from "../../queries";
import { toast } from "../../stores/toast";
import shell from "./Studio.module.css";
import styles from "./Register.module.css";

const FILTERS: { value: DocumentStatus | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "issued", label: "Issued" },
  { value: "revoked", label: "Revoked" },
  { value: "pending", label: "Incomplete" },
];

export function RegisterPage() {
  const [status, setStatus] = useState<DocumentStatus | undefined>(undefined);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const list = useStudioDocuments(status, q);
  const issuer = useStudioIssuer();
  const [revoking, setRevoking] = useState<StudioDocument | null>(null);
  const [discarding, setDiscarding] = useState<StudioDocument | null>(null);

  useEffect(() => {
    document.title = "Register · Signing studio";
  }, []);

  const counts = list.data?.pages[0]?.counts;
  const total = counts ? counts.issued + counts.revoked + counts.pending : 0;
  const docs = list.data?.pages.flatMap((p) => p.documents) ?? [];
  const issuerIncomplete = issuer.data && (!issuer.data.organization || !issuer.data.signatory);

  return (
    <div className={styles.page}>
      <header className={shell.header}>
        <div className={shell.headerText}>
          <h1 className={shell.title}>Register</h1>
          <p className={shell.subtitle}>
            {counts ? `${plural(counts.issued, "document")} issued · ${counts.revoked} revoked` : "Loading…"}
          </p>
        </div>
        <ButtonLink to="/studio/sign" variant="primary" ring>
          Sign a PDF
        </ButtonLink>
      </header>

      {issuerIncomplete ? (
        <div className={shell.banner}>
          <span>
            <strong>Add the signatory before signing.</strong> Verification pages need the organisation and the name of the
            person signing.
          </span>
          <ButtonLink to="/studio/settings" size="sm">
            Open settings
          </ButtonLink>
        </div>
      ) : null}

      {total > 0 || status || q ? (
        <div className={styles.toolbar}>
          <div className={styles.filters} role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                className={styles.filter}
                aria-pressed={status === f.value}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
                <span className={styles.count}>{counts ? (f.value ? counts[f.value] : total) : ""}</span>
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <Search size={15} aria-hidden />
            <span className="visually-hidden">Search documents</span>
            <input
              type="search"
              placeholder="Search title, file or serial"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {list.isPending ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading documents" />
      ) : list.isError ? (
        <p className={styles.error} role="alert">
          {list.error instanceof ApiError ? list.error.message : "The register could not be loaded."}{" "}
          <button type="button" className={styles.linkButton} onClick={() => list.refetch()}>
            Try again
          </button>
        </p>
      ) : docs.length === 0 ? (
        total === 0 && !status && !q ? (
          <FirstRun />
        ) : (
          <div className={styles.empty}>
            <p>No documents match{q ? <> “{q}”</> : " this filter"}.</p>
            <Button
              size="sm"
              onClick={() => {
                setSearch("");
                setStatus(undefined);
              }}
            >
              Clear filters
            </Button>
          </div>
        )
      ) : (
        <div className={styles.tableWrap} data-stale={list.isPlaceholderData || undefined}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Serial</th>
                <th scope="col">Document</th>
                <th scope="col" className={styles.num}>
                  Pages
                </th>
                <th scope="col">Issued</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td className={styles.serial}>
                    <span className="mono">{doc.serial}</span>
                  </td>
                  <td className={styles.docCell}>
                    <span className={styles.docTitle}>{doc.title}</span>
                    <span className={styles.docFile}>{doc.fileName}</span>
                  </td>
                  <td className={`${styles.num} ${styles.pages}`}>{doc.pageCount}</td>
                  <td className={styles.date}>{doc.issuedAt ? formatShortDate(doc.issuedAt) : formatShortDate(doc.createdAt)}</td>
                  <td className={styles.status}>
                    <StatusLabel kind={doc.status} />
                  </td>
                  <td className={styles.actions}>
                    {doc.status !== "pending" ? (
                      <>
                        <CopyButton value={doc.verifyUrl} label="Link" copiedMessage={`Link to ${doc.serial} copied`} />
                        <a className={styles.iconLink} href={`/v/${doc.id}`} target="_blank" rel="noopener" aria-label={`Open the verification page for ${doc.serial}`}>
                          <ArrowUpRight size={16} aria-hidden />
                        </a>
                      </>
                    ) : null}
                    {doc.status === "issued" ? (
                      <Button size="sm" variant="quiet" onClick={() => setRevoking(doc)}>
                        Revoke
                      </Button>
                    ) : null}
                    {doc.status === "pending" ? (
                      <Button size="sm" variant="quiet" onClick={() => setDiscarding(doc)}>
                        Discard
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.hasNextPage ? (
        <div className={styles.more}>
          <Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Show more
          </Button>
        </div>
      ) : null}

      <RevokeDialog doc={revoking} onClose={() => setRevoking(null)} />
      <DiscardDialog doc={discarding} onClose={() => setDiscarding(null)} />
    </div>
  );
}

function FirstRun() {
  return (
    <div className={styles.firstRun}>
      <h2 className={styles.firstRunTitle}>Nothing signed yet</h2>
      <p>
        Choose a PDF, place the QR stamp where it belongs, and issue it. The file stays in your browser; only its SHA-512
        fingerprint is recorded here, so anyone holding the file can check it.
      </p>
      <ButtonLink to="/studio/sign" variant="primary" ring>
        Sign your first PDF
      </ButtonLink>
      <p className={styles.firstRunNote}>
        Check the organisation and signatory in <Link to="/studio/settings">Settings</Link> first; they are printed on every
        stamp.
      </p>
    </div>
  );
}

function RevokeDialog({ doc, onClose }: { doc: StudioDocument | null; onClose: () => void }) {
  const revoke = useRevoke();
  const [reason, setReason] = useState("");
  const close = () => {
    setReason("");
    revoke.reset();
    onClose();
  };
  const error = revoke.error instanceof ApiError ? revoke.error.message : revoke.isError ? "Revoking failed." : null;

  return (
    <Dialog
      open={doc !== null}
      onClose={close}
      title={<>Revoke {doc?.serial}?</>}
      footer={
        <>
          <Button onClick={close}>Keep it</Button>
          <Button
            variant="danger"
            loading={revoke.isPending}
            disabled={!reason.trim()}
            onClick={() =>
              doc &&
              revoke.mutate(
                { id: doc.id, reason },
                {
                  onSuccess: () => {
                    toast(`${doc.serial} revoked`);
                    close();
                  },
                },
              )
            }
          >
            Revoke document
          </Button>
        </>
      }
    >
      <p>
        <strong>{doc?.title}</strong> will show as revoked on its verification page, with the reason below. Anyone checking
        it will be told not to rely on it. This cannot be undone.
      </p>
      <TextAreaField
        label="Reason shown to verifiers"
        aside={`${reason.length} / 280`}
        maxLength={280}
        rows={3}
        placeholder="e.g. Superseded by a corrected letter"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
      />
    </Dialog>
  );
}

function DiscardDialog({ doc, onClose }: { doc: StudioDocument | null; onClose: () => void }) {
  const discard = useDiscard();
  return (
    <Dialog
      open={doc !== null}
      onClose={onClose}
      title={<>Discard {doc?.serial}?</>}
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            loading={discard.isPending}
            onClick={() =>
              doc &&
              discard.mutate(doc.id, {
                onSuccess: () => {
                  toast(`${doc.serial} discarded`);
                  onClose();
                },
              })
            }
          >
            Discard record
          </Button>
        </>
      }
    >
      <p>
        This serial was reserved but its fingerprint was never recorded, so it verifies nothing. Discarding frees it. If a
        stamped copy was downloaded anyway, its QR will lead to “No document has this code”.
      </p>
    </Dialog>
  );
}
