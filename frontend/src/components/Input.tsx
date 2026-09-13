import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-lg border border-border bg-card px-3 text-fg placeholder:text-muted-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${className}`}
      {...rest}
    />
  );
}
