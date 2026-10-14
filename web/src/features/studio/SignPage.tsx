import { useEffect } from "react";
import { ButtonLink } from "../../components/Button";
import { DropZone } from "../../components/DropZone";
import type { Issuer } from "../../lib/types";
import { useStudioIssuer } from "../../queries";
import { useSigning } from "../../stores/signing";
import shell from "./Studio.module.css";
import { SignInspector } from "./SignInspector";
import { SignStage } from "./SignStage";
import styles from "./Sign.module.css";

export function SignPage() {
  const issuerQuery = useStudioIssuer();
  const phase = useSigning((s) => s.phase);
  const error = useSigning((s) => s.error);
  const load = useSigning((s) => s.load);
  const needsPlacement = useSigning((s) => s.needsPlacement);
  const anchor = useSigning((s) => s.anchor);

  useEffect(() => {
    document.title = "Sign a PDF · Signing studio";
  }, []);

  const issuer: Issuer | undefined = issuerQuery.data;

  // A freshly opened file gets the stamp in the bottom-right corner of page 1,
  // once the issuer details that size its caption are known.
  useEffect(() => {
    if (phase === "ready" && needsPlacement && issuer) anchor("bottom-right", issuer);
  }, [phase, needsPlacement, issuer, anchor]);

  const incomplete = issuer && (!issuer.organization || !issuer.signatory);

  if (phase === "empty" || phase === "loading" || !issuer) {
    return (
      <div className={styles.emptyPage}>
        <header className={shell.header}>
          <div className={shell.headerText}>
            <h1 className={shell.title}>Sign a PDF</h1>
            <p className={shell.subtitle}>Place a verification QR code on the document, then issue it.</p>
          </div>
        </header>
        {incomplete ? (
          <div className={shell.banner}>
            <span>
              <strong>The stamp needs a signatory.</strong> Add the organisation and the name of the person signing first.
            </span>
            <ButtonLink to="/studio/settings" size="sm">
              Open settings
            </ButtonLink>
          </div>
        ) : null}
        <div className={styles.emptyDrop}>
          <DropZone
            onFile={load}
            busy={phase === "loading" || !issuer}
            title={phase === "loading" ? "Opening the PDF…" : "Drop the PDF to sign"}
            hint="It is opened in this browser and never uploaded."
          />
          {error ? (
            <p className={styles.issueError} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <SignStage issuer={issuer} />
      <SignInspector issuer={issuer} />
    </div>
  );
}
