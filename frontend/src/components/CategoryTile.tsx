import { categoryFor } from "../categories";

/** Category icon on a tinted rounded square (expense rows, detail headers). */
export function CategoryTile({ category, size = 40 }: { category: string | null | undefined; size?: number }) {
  const c = categoryFor(category);
  const Icon = c.icon;
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        color: `oklch(0.58 0.14 ${c.hue})`,
        background: `light-dark(oklch(0.95 0.04 ${c.hue}), oklch(0.32 0.06 ${c.hue}))`,
      }}
    >
      <Icon size={size * 0.5} />
    </span>
  );
}
