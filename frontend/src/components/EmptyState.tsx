import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-12 text-center">
      <h3 className="font-medium">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-fg">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
