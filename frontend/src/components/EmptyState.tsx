import type { ReactNode } from "react";
import type { Icon } from "./icons";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: Icon;
};

export function EmptyState({ title, description, action, icon: Icon }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-10 text-center">
      {Icon && (
        <span className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-fg">
          <Icon size={24} />
        </span>
      )}
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="max-w-xs text-sm text-muted-fg">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
