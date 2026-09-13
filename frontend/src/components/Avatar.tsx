/** Avatar with initials; background picked from a fixed 6-color palette by name hash. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const color = ([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 6, 0) + 6) % 6 + 1;
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `var(--avatar-${color})`,
      }}
    >
      {initials || "?"}
    </span>
  );
}
