import type { ReactNode } from "react";

/** Large page title with optional subtitle and trailing actions. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3 md:mb-7">
      <div className="min-w-0">
        <h1 className="truncate text-[1.75rem] font-bold leading-tight tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-fg">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}
