/** Hash a name to one of the 8 avatar hues (stable across sessions). */
export function avatarColor(name: string): string {
  const n = ([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 8, 0) + 8) % 8;
  return `var(--avatar-${n + 1})`;
}

function initials(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Person avatar: initials on a hashed color. `pending` = invited, not yet joined. */
export function Avatar({ name, size = 32, pending = false, ring = false, letters = 2 }: { name: string; size?: number; pending?: boolean; ring?: boolean; letters?: 1 | 2 }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        pending ? "border-[1.5px] border-dashed border-muted-fg bg-muted text-muted-fg" : "text-white"
      } ${ring ? "ring-2 ring-card" : ""}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.38),
        background: pending ? undefined : avatarColor(name),
      }}
    >
      {initials(name).slice(0, letters)}
    </span>
  );
}

/** Overlapping avatar row; shows "+N" past `max`. */
export function AvatarStack({ names, size = 26, max = 4 }: { names: string[]; size?: number; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className="flex items-center" aria-hidden="true">
      {shown.map((n, i) => (
        <span key={`${n}-${i}`} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar name={n} size={size} ring letters={1} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-fg ring-2 ring-card"
          style={{ width: size, height: size, marginLeft: -size * 0.3 }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Rounded-square tile for groups: initials on a soft tint of the hashed hue. */
export function GroupAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const color = avatarColor(name);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        fontSize: size * 0.36,
        color,
        background: `color-mix(in oklch, ${color} 16%, var(--card))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 22%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}
