import { useEffect } from "react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import styles from "./public/Verify.module.css";

export function NotFoundPage() {
  useEffect(() => {
    document.title = "Page not found";
  }, []);
  return (
    <div className={styles.page}>
      <div className={styles.message}>
        <h1 className={styles.messageTitle}>There is nothing at this address</h1>
        <p>
          To check a document, scan its QR code or <Link to="/">check the file here</Link>.
        </p>
      </div>
    </div>
  );
}

export function RouteError() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : null;
  return (
    <div className={styles.page} style={{ paddingBlock: "4rem" }}>
      <div className={styles.message}>
        <h1 className={styles.messageTitle}>{status === 404 ? "There is nothing at this address" : "This page failed to load"}</h1>
        <p>
          {status === 404 ? "Check the link and try again." : "Reload the page. If it keeps happening, the site may have just been updated."}
        </p>
        <p>
          <a href="/">Go to the start page</a>
        </p>
      </div>
    </div>
  );
}
