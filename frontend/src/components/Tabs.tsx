import { useId } from "react";

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  /** Pill segmented control (fit-content) vs the default full-width box. */
  pills?: boolean;
};

export function Tabs({ tabs, value, onChange, pills }: Props) {
  const id = useId();
  return (
    <div
      role="tablist"
      className={pills ? "w-fit gap-0.5 rounded-full bg-muted p-0.5" : "flex gap-1 rounded-lg bg-muted p-1"}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${id}-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          aria-controls={`${id}-panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={`cursor-pointer text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
            pills ? "h-8 rounded-full px-4" : "h-8 rounded-md px-3"
          } ${
            value === t.id
              ? "bg-card font-medium text-fg shadow-sm"
              : "text-muted-fg hover:text-fg"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
