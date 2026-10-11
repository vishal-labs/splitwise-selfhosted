import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "h-12 w-full rounded-xl border border-border bg-card px-3.5 text-[1rem] text-fg placeholder:text-muted-fg/70 transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 user-invalid:border-destructive";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...rest} />;
}

/** Label + control + optional hint, stacked. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-fg">{hint}</span>}
    </label>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
