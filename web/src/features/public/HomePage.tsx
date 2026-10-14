import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { DropZone } from "../../components/DropZone";
import { TextField } from "../../components/Field";
import { HashRegister } from "../../components/HashRegister";
import { StatusLabel } from "../../components/StatusMark";
import { ApiError } from "../../lib/api";
import { normalizeSerial } from "../../lib/format";
import { sha512File } from "../../lib/hash";
import { useIssuer, useLookup } from "../../queries";
import type { VerifyHandoff } from "./VerifyPage";
import styles from "./Home.module.css";

export function HomePage() {
  const issuer = useIssuer();
  const org = issuer.data?.organization || "the issuer";

  useEffect(() => {
    document.title = issuer.data?.organization ? `Check a document · ${issuer.data.organization}` : "Document verification";
  }, [issuer.data]);

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Check a document from {org}</h1>
        <p className={styles.lead}>
          Every document {org} signs carries a QR code that opens its record on this site. Have the file but not the code?
          Check the file itself.
        </p>
      </header>

      <div className={styles.tools}>
        <FileCheck />
        <SerialLookup />
      </div>

      <section className={styles.how} aria-labelledby="how-title">
        <h2 id="how-title" className={styles.howTitle}>
          How verification works
        </h2>
        <div className={styles.claims}>
          <div className={styles.claim}>
            <p className={styles.claimHead}>Signing records a fingerprint.</p>
            <p>
              When {org} signs a PDF, a QR code is stamped onto it and the SHA-512 fingerprint of the finished file is
              recorded here. The file itself is never stored.
            </p>
          </div>
          <div className={styles.claim}>
            <p className={styles.claimHead}>The QR code leads to the issuer’s own domain.</p>
            <p>
              Scanning it opens <span className="mono">{window.location.host}</span>, where the record shows who signed and
              when, and whether the document has been revoked.
            </p>
          </div>
          <div className={styles.claim}>
            <p className={styles.claimHead}>Your copy is checked on your device.</p>
            <p>
              Your browser computes the fingerprint of your file and compares it with the record. Any change to the file,
              however small, fails the check.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function FileCheck() {
  const navigate = useNavigate();
  const lookup = useLookup();
  const [file, setFile] = useState<File | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);

  async function check(chosen: File) {
    setFile(chosen);
    setDigest(null);
    lookup.reset();
    setHashing(true);
    try {
      const sha512 = await sha512File(chosen);
      setDigest(sha512);
      const doc = await lookup.mutateAsync(sha512).catch(() => null);
      if (doc) {
        const handoff: VerifyHandoff = { sha512, fileName: chosen.name };
        navigate(`/v/${doc.id}`, { state: handoff });
      }
    } finally {
      setHashing(false);
    }
  }

  const notFound = lookup.error instanceof ApiError && lookup.error.code === "no_record";

  return (
    <section className={styles.tool} aria-labelledby="file-check-title">
      <div className={styles.toolHead}>
        <h2 id="file-check-title" className={styles.toolTitle}>
          Check a file
        </h2>
        <p className={styles.toolLead}>The fingerprint is computed in this browser. The file is never uploaded.</p>
      </div>
      <DropZone onFile={check} file={file} busy={hashing || lookup.isPending} title="Drop the signed PDF here" hint="Or choose it from your device." />
      {hashing || lookup.isPending ? (
        <p className={styles.progress} aria-live="polite">
          {hashing && !digest ? "Computing the fingerprint…" : "Looking for a matching record…"}
        </p>
      ) : null}
      {notFound && digest ? (
        <div className={styles.result} aria-live="polite">
          <StatusLabel kind="mismatch" label="No matching record" />
          <p className={styles.resultText}>
            No document issued here has this fingerprint. Either it was changed after signing, or it was never signed here.
            If it has a QR code, scan it to see the original record.
          </p>
          <HashRegister supplied={digest} result="mismatch" />
        </div>
      ) : null}
      {lookup.isError && !notFound ? (
        <p className={styles.error} role="alert">
          {lookup.error instanceof ApiError ? lookup.error.message : "The check could not be completed."}
        </p>
      ) : null}
    </section>
  );
}

function SerialLookup() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className={styles.tool} aria-labelledby="serial-title">
      <div className={styles.toolHead}>
        <h2 id="serial-title" className={styles.toolTitle}>
          Look up a serial
        </h2>
        <p className={styles.toolLead}>The serial is printed beside the QR code, in three groups of four.</p>
      </div>
      <form
        className={styles.serialForm}
        onSubmit={(e) => {
          e.preventDefault();
          const id = normalizeSerial(value);
          if (!id) {
            setError("A serial has 12 letters and digits, like K7Q4-M2XD-9PRA.");
            return;
          }
          navigate(`/v/${id}`);
        }}
      >
        <TextField
          label="Serial"
          mono
          placeholder="K7Q4-M2XD-9PRA"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          error={error}
        />
        <Button type="submit" variant="primary" ring>
          Open record
        </Button>
      </form>
    </section>
  );
}
