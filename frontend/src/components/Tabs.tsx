import { useId } from "react";

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
};

export function Tabs({ tabs, value, onChange }: Props) {
  const id = useId();
  return (
    <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${id}-tab-${t.id}`}
          role="tab"
          aria-selected={value === t.id}
          aria-controls={`${id}-panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={`h-8 cursor-pointer rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
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
