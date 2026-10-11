import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft" | "hero";
  /** sm = compact toolbar, md = default (44px touch target), lg = full-width CTA,
   *  icon = square 2.5rem, icon-sm = square 2rem. */
  size?: "sm" | "md" | "lg" | "icon" | "icon-sm";
};

const styles: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-primary text-primary-fg font-semibold shadow-card hover:brightness-[1.04] active:brightness-95",
  secondary: "bg-card text-fg border border-border font-medium hover:bg-muted",
  ghost: "text-fg font-medium hover:bg-muted",
  soft: "bg-primary-soft text-primary-soft-fg font-semibold hover:brightness-[0.98]",
  danger: "bg-destructive text-destructive-fg font-semibold hover:brightness-105",
  hero: "bg-hero-fg/12 text-hero-fg font-medium hover:bg-hero-fg/20",
};

export const buttonSizes = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5",
  lg: "h-12 px-6 text-[1.0625rem]",
  icon: "h-10 w-10 p-0",
  "icon-sm": "h-8 w-8 p-0",
};

/** Shared classes so links (<a>, <Link>) can look like buttons. */
export function buttonClass(variant: NonNullable<Props["variant"]> = "primary", size: NonNullable<Props["size"]> = "md") {
  return `inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-full transition-[background-color,filter,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${buttonSizes[size]} ${styles[variant]}`;
}

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }: Props) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...rest} />;
}
