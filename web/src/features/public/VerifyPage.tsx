import { CalendarDays, Globe, Hash } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router";
import { CopyButton } from "../../components/CopyButton";
import { StatusMark } from "../../components/StatusMark";
import { ApiError } from "../../lib/api";
import { formatBytes, formatDate, formatDateTime, hostOf, normalizeSerial, plural } from "../../lib/format";
import type { PublicDocument } from "../../lib/types";
import { useDocument } from "../../queries";
import { IntegrityPanel } from "./IntegrityPanel";
import styles from "./Verify.module.css";

/** State handed over by the home page after it found a document by file. */
export interface VerifyHandoff {
  sha512: string;
  fileName: string;
}

export function VerifyPage() {
  const params = useParams();
  const location = useLocation();
  const id = normalizeSerial(params.id ?? "");
  const query = useDocument(id);
  const handoff = location.state as VerifyHandoff | null;

  useEffect(() => {
    const doc = query.data;
    document.title = doc ? `${doc.serial} · ${doc.issuer.organization}` : "Document verification";
  }, [query.data]);

  if (!id || (query.error instanceof ApiError && query.error.status === 404)) {
    return <NotFound code={params.id ?? ""} />;
  }
  if (query.isPending) {
    return <RecordSkeleton />;
  }
  if (query.isError) {
    return (
      <div className={styles.page}>
        <div className={styles.message}>
          <h1 className={styles.messageTitle}>The record could not be loaded</h1>
          <p>{query.error instanceof ApiError ? query.error.message : "Try again in a moment."}</p>
          <button type="button" className={styles.textButton} onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const doc = query.data;
  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.head}>
          <StatusSentence doc={doc} />
          <ProofRow doc={doc} />
          {doc.status === "revoked" ? <Revocation doc={doc} /> : null}
        </div>
        <RecordFields doc={doc} />
        <aside className={styles.aside}>
          <IntegrityPanel doc={doc} initialDigest={handoff?.sha512} initialFileName={handoff?.fileName} />
        </aside>
        <WhatThisProves doc={doc} />
      </div>
    </div>
  );
}

function StatusSentence({ doc }: { doc: PublicDocument }) {
  const org = doc.issuer.organization;
  const sentence =
    doc.status === "issued" ? `Issued by ${org}` : doc.status === "revoked" ? `Revoked by ${org}` : "This record was never completed";
  return (
    <header className={styles.statusHead}>
      <h1 id="record-title" className={styles.status} data-status={doc.status}>
        <StatusMark kind={doc.status} size={26} />
        <span>{sentence}</span>
      </h1>
      <p className={styles.docTitle}>{doc.title}</p>
    </header>
  );
}

function ProofRow({ doc }: { doc: PublicDocument }) {
  return (
    <ul className={styles.proof}>
      <li>
        <Globe size={15} aria-hidden />
        <span>
          Served from <strong>{hostOf(doc.verifyUrl)}</strong>
        </span>
      </li>
      <li>
        <CalendarDays size={15} aria-hidden />
        <span>{doc.issuedAt ? <>Issued {formatDate(doc.issuedAt)}</> : "Not issued"}</span>
      </li>
      <li>
        <Hash size={15} aria-hidden />
        <span>
          Serial <span className="mono">{doc.serial}</span>
        </span>
      </li>
    </ul>
  );
}

function Revocation({ doc }: { doc: PublicDocument }) {
  return (
    <div className={styles.revocation} role="note">
      <p className={styles.revocationTitle}>Withdrawn on {formatDate(doc.revokedAt)}</p>
      {doc.revocationReason ? <p>“{doc.revocationReason}”</p> : null}
      <p className={styles.revocationNote}>A revoked document should no longer be relied on, even if the file is genuine.</p>
    </div>
  );
}

function RecordFields({ doc }: { doc: PublicDocument }) {
  const signer = [doc.issuer.signatory, doc.issuer.role].filter(Boolean).join(", ");
  return (
    <section className={styles.fieldsPanel} aria-label="Record">
      <dl className={styles.fields}>
        <div>
          <dt>Document</dt>
          <dd>{doc.title}</dd>
        </div>
        <div>
          <dt>File name at issue</dt>
          <dd className={styles.break}>{doc.fileName}</dd>
        </div>
        <div>
          <dt>Signed by</dt>
          <dd>{signer}</dd>
        </div>
        <div>
          <dt>On behalf of</dt>
          <dd>
            {doc.issuer.url ? (
              <a href={doc.issuer.url} rel="noopener">
                {doc.issuer.organization}
              </a>
            ) : (
              doc.issuer.organization
            )}
          </dd>
        </div>
        <div>
          <dt>Issued</dt>
          <dd>{formatDateTime(doc.issuedAt)}</dd>
        </div>
        <div>
          <dt>Signed file</dt>
          <dd>
            {plural(doc.pageCount, "page")}, {formatBytes(doc.fileSize)}
          </dd>
        </div>
        <div className={styles.linkRow}>
          <dt>Verification link</dt>
          <dd>
            <span className={`mono ${styles.break}`}>{doc.verifyUrl}</span>
            <CopyButton value={doc.verifyUrl} label="Copy link" copiedMessage="Verification link copied" />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function WhatThisProves({ doc }: { doc: PublicDocument }) {
  const org = doc.issuer.organization;
  return (
    <section className={styles.proves} aria-labelledby="proves-title">
      <h2 id="proves-title" className={styles.sectionTitle}>
        What this page proves
      </h2>
      <div className={styles.claims}>
        <div className={styles.claim}>
          <p className={styles.claimHead}>The record comes from {org}.</p>
          <p>
            It is served from <span className="mono">{hostOf(doc.verifyUrl)}</span>, a domain {org} controls. Check the
            address bar shows exactly that.
          </p>
        </div>
        <div className={styles.claim}>
          <p className={styles.claimHead}>A matching fingerprint proves the file is unchanged.</p>
          <p>
            The SHA-512 fingerprint of the signed file was recorded when it was issued. Any edit, however small, changes
            every group of it.
          </p>
        </div>
        <div className={styles.claim}>
          <p className={styles.claimHead}>The QR code alone proves nothing.</p>
          <p>A printed code can be copied onto any page. Check the fingerprint of the file, or compare the details above with a paper copy.</p>
        </div>
      </div>
    </section>
  );
}

function NotFound({ code }: { code: string }) {
  return (
    <div className={styles.page}>
      <div className={styles.message}>
        <h1 className={styles.messageTitle}>
          <StatusMark kind="mismatch" size={24} />
          No document has this code
        </h1>
        <p>
          The serial <span className="mono">{code || "—"}</span> does not match any document issued here. Check it against the
          one printed under the QR code; letters O and I are read as 0 and 1.
        </p>
        <p>
          A document that points here but has no record may have been altered. <Link to="/">Check the file itself</Link> instead.
        </p>
      </div>
    </div>
  );
}

function RecordSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading the record">
      <div className={styles.layout}>
        <div className={styles.head}>
          <div className={`${styles.bone} ${styles.boneTitle}`} />
          <div className={`${styles.bone} ${styles.boneLine}`} />
        </div>
        <div className={styles.fieldsPanel}>
          <div className={`${styles.bone} ${styles.bonePanel}`} />
        </div>
        <div className={styles.aside}>
          <div className={`${styles.bone} ${styles.boneAside}`} />
        </div>
      </div>
    </div>
  );
}
