import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const styles: Record<NonNullable<Props["variant"]>, string> = {
  primary:
    "bg-primary text-primary-fg hover:opacity-90 font-medium",
  secondary:
    "bg-card text-fg border border-border hover:bg-muted",
  ghost: "text-fg hover:bg-muted",
  danger: "bg-destructive text-destructive-fg hover:opacity-90",
};

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 transition-[background-color,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
