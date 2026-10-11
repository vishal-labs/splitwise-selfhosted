/** App mark: amber rounded square with the bolt (matches public/icon.svg). */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className="shrink-0">
      <rect width="512" height="512" rx="128" fill="var(--primary)" />
      <path d="M310 96 L140 296h104l-42 120 170-200H268z" fill="var(--primary-fg)" />
    </svg>
  );
}
