/** Placeholder rows while a list loads (avatar + two text lines + trailing amount). */
export function ListSkeleton({ rows = 4, tile = "rounded-xl" }: { rows?: number; tile?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-3">
          <div className={`skeleton h-10 w-10 shrink-0 ${tile}`} />
          <div className="grid flex-1 gap-2">
            <div className="skeleton h-3.5" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            <div className="skeleton h-3 w-1/3" />
          </div>
          <div className="skeleton h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function Block({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}
