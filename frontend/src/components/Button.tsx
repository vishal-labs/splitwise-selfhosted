import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** "icon" = square 2.5rem touch target, no padding. */
  size?: "md" | "icon";
};

const styles: Record<NonNullable<Props["variant"]>, string> = {
  primary:
    "bg-primary text-primary-fg hover:opacity-90 font-medium",
  secondary:
    "bg-card text-fg border border-border hover:bg-muted",
  ghost: "text-fg hover:bg-muted",
  danger: "bg-destructive text-destructive-fg hover:opacity-90",
};

const sizes = {
  md: "h-10 px-4",
  icon: "h-10 w-10 p-0",
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: Props) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg transition-[background-color,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
