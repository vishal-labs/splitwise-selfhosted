import { useId } from "react";

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  /** Stretch segments to fill the row (default: fit content). */
  full?: boolean;
  /** Accepted for backwards compatibility; every Tabs is a pill segmented control. */
  pills?: boolean;
  label?: string;
};

/** Pill segmented control. */
export function Tabs({ tabs, value, onChange, full, label }: Props) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`${full ? "grid w-full" : "inline-grid w-fit"} gap-0.5 rounded-full bg-muted p-1`}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${id}-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`h-9 cursor-pointer whitespace-nowrap rounded-full px-4 text-sm transition-all max-sm:px-3 ${
            value === t.id ? "bg-card font-semibold text-fg shadow-card" : "font-medium text-muted-fg hover:text-fg"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
