import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Button } from "../../components/Button";
import { TextField } from "../../components/Field";
import { ApiError } from "../../lib/api";
import { useIssuer, useLogin, useSession } from "../../queries";
import styles from "./Login.module.css";

/** Only follow same-site paths after sign-in. */
function safeNext(next: string | null) {
  return next && next.startsWith("/studio") ? next : "/studio";
}

export function LoginPage() {
  const session = useSession();
  const issuer = useIssuer();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const next = safeNext(params.get("next"));

  useEffect(() => {
    document.title = "Issuer sign-in";
  }, []);

  if (session.data?.authenticated) {
    return <Navigate to={next} replace />;
  }

  const err = login.error instanceof ApiError ? login.error : null;
  const fieldError = err?.code === "wrong_password" ? err.message : null;
  const formError = err && !fieldError ? err.message : login.isError && !err ? "Sign-in failed. Try again." : null;
  const unavailable = session.data?.signInAvailable === false;

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        <h1 className={styles.title}>Sign in to issue documents</h1>
        <p className={styles.lead}>
          Only the owner of {issuer.data?.organization || "this site"} can stamp and issue documents. Anyone can verify them
          without signing in.
        </p>

        {unavailable ? (
          <div className={styles.notice}>
            <p className={styles.noticeTitle}>Sign-in is turned off</p>
            <p>
              No owner password is configured. Set one of at least 12 characters as a Worker secret, then reload this page:
            </p>
            <code className={styles.command}>wrangler secret put OWNER_PASSWORD</code>
          </div>
        ) : (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              if (!password) return;
              login.mutate(password, { onSuccess: () => navigate(next, { replace: true }) });
            }}
          >
            {/* Lets password managers file the credential under a stable name. */}
            <input type="text" name="username" autoComplete="username" value="owner" readOnly hidden />
            <TextField
              label="Owner password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                login.reset();
              }}
              error={fieldError}
            />
            {formError ? (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            ) : null}
            <Button type="submit" variant="primary" ring loading={login.isPending} disabled={!password}>
              Sign in
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
