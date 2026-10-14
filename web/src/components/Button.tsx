import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "quiet" | "danger";

interface StyleProps {
  variant?: Variant;
  size?: "md" | "sm";
  block?: boolean;
  /** Shows the accent ring; reserved for the screen's one live action. */
  ring?: boolean;
}

function classes({ variant = "secondary", size = "md", block }: StyleProps, extra?: string) {
  return [styles.button, styles[variant], size === "sm" && styles.sm, block && styles.block, extra]
    .filter(Boolean)
    .join(" ");
}

interface ButtonProps extends StyleProps, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant, size, block, ring, loading, icon, children, className, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={classes({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : ring ? <span className={styles.ring} aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends StyleProps, LinkProps {
  icon?: ReactNode;
}

export function ButtonLink({ variant, size, block, ring, icon, children, className, ...rest }: ButtonLinkProps) {
  return (
    <Link className={classes({ variant, size, block }, className)} {...rest}>
      {ring ? <span className={styles.ring} aria-hidden /> : icon}
      {children}
    </Link>
  );
}
