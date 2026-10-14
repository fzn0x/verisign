import { CircleAlert } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface FieldShellProps {
  id: string;
  label: ReactNode;
  aside?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

function FieldShell({ id, label, aside, hint, error, children, className }: FieldShellProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {aside ? <span className={styles.aside}>{aside}</span> : null}
      </div>
      {children}
      {error ? (
        <p className={styles.error} id={`${id}-error`} role="alert">
          <CircleAlert size={14} aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: ReactNode, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: ReactNode;
  aside?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  mono?: boolean;
  fieldClassName?: string;
}

export function TextField({ label, aside, hint, error, mono, fieldClassName, className, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} aside={aside} hint={hint} error={error} className={fieldClassName}>
      <input
        id={id}
        className={[styles.control, mono && styles.mono, className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
    </FieldShell>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: ReactNode;
  aside?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  mono?: boolean;
  fieldClassName?: string;
}

export function TextAreaField({ label, aside, hint, error, mono, fieldClassName, className, ...rest }: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} aside={aside} hint={hint} error={error} className={fieldClassName}>
      <textarea
        id={id}
        className={[styles.control, mono && styles.mono, className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...rest}
      />
    </FieldShell>
  );
}
