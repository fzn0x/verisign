import { Link, Outlet } from "react-router";
import { useIssuer } from "../../queries";
import styles from "./PublicLayout.module.css";

const SOURCE_URL = "https://github.com/fzn0x/verisign";

export function PublicLayout() {
  const issuer = useIssuer();
  const organization = issuer.data?.organization || "Document verification";

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.inner}>
          <Link to="/" className={styles.brand}>
            {organization}
          </Link>
          <span className={styles.domain} title="This page is served from this domain">
            {window.location.host}
          </span>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className={styles.inner}>
          <p>
            Checks run in your browser. Files you check are never uploaded.
          </p>
          <nav className={styles.footerNav} aria-label="Site">
            <Link to="/">Check a document</Link>
            <a href={SOURCE_URL} rel="noopener">
              Source code (GPL-3.0)
            </a>
            <Link to="/login">Issuer sign-in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
