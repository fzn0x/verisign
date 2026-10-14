import { ExternalLink, FilePlus2, LogOut, Rows3, Settings2 } from "lucide-react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useIssuer, useLogout, useSession } from "../../queries";
import styles from "./Studio.module.css";

const NAV = [
  { to: "/studio", label: "Register", icon: Rows3, end: true },
  { to: "/studio/sign", label: "Sign a PDF", icon: FilePlus2, end: false },
  { to: "/studio/settings", label: "Settings", icon: Settings2, end: false },
];

export function StudioLayout() {
  const session = useSession();
  const issuer = useIssuer();
  const logout = useLogout();
  const location = useLocation();
  const navigate = useNavigate();

  if (session.isPending) {
    return <div className={styles.booting} aria-busy="true" aria-label="Checking your session" />;
  }
  if (!session.data?.authenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <div className={styles.railBrand}>
          <span className={styles.wordmark}>{issuer.data?.organization || "Studio"}</span>
          <span className={styles.railSub}>Signing studio</span>
        </div>
        <nav className={styles.nav} aria-label="Studio">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={styles.navItem}>
              <Icon size={17} strokeWidth={1.75} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={styles.railFoot}>
          <a className={styles.navItem} href="/" target="_blank" rel="noopener">
            <ExternalLink size={17} strokeWidth={1.75} aria-hidden />
            <span>Public page</span>
          </a>
          <button
            type="button"
            className={styles.navItem}
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
            disabled={logout.isPending}
          >
            <LogOut size={17} strokeWidth={1.75} aria-hidden />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
