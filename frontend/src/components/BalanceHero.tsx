import type { ReactNode } from "react";
import { joinTotals, type Totals } from "../balance";

/** Navy summary card: overall position + owed / owe breakdown (per currency). */
export function BalanceHero({ owed, owe, loading, children }: { owed: Totals; owe: Totals; loading?: boolean; children?: ReactNode }) {
  const settled = owed.size === 0 && owe.size === 0;
  // single-currency users get one big net number; mixed currencies list both sides
  const currencies = new Set([...owed.keys(), ...owe.keys()]);
  const single = currencies.size === 1 ? [...currencies][0] : null;
  const net = single ? (owed.get(single) ?? 0) - (owe.get(single) ?? 0) : 0;

  return (
    <section
      aria-label="Your balance"
      className="relative overflow-hidden rounded-[1.375rem] bg-hero p-5 text-hero-fg shadow-float md:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-2xl"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 65%)" }}
      />
      <p className="relative text-sm font-medium text-hero-fg/70">Overall balance</p>
      {loading ? (
        <div className="relative mt-2 h-9 w-48 animate-pulse rounded-lg bg-hero-fg/10" />
      ) : settled ? (
        <p className="relative mt-1 text-[1.75rem] font-bold tracking-tight">You're all settled up</p>
      ) : single ? (
        <p className="relative mt-1 text-[1.75rem] font-bold tracking-tight md:text-[2rem]">
          <span className="block text-base font-medium text-hero-fg/80">
            {net > 0 ? "You are owed" : net < 0 ? "You owe" : "You're even"}
          </span>
          <span className={`tabular ${net > 0 ? "text-[oklch(0.82_0.15_158)]" : net < 0 ? "text-[oklch(0.8_0.14_50)]" : ""}`}>
            {joinTotals(new Map([[single, Math.abs(net)]]))}
          </span>
        </p>
      ) : (
        <p className="relative mt-1 text-xl font-bold">Across {currencies.size} currencies</p>
      )}
      <div className="relative mt-4 grid grid-cols-2 gap-2">
        <Pill label="You are owed" value={loading ? "…" : owed.size ? joinTotals(owed) : "—"} tone="pos" />
        <Pill label="You owe" value={loading ? "…" : owe.size ? joinTotals(owe) : "—"} tone="neg" />
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </section>
  );
}

function Pill({ label, value, tone }: { label: string; value: string; tone: "pos" | "neg" }) {
  return (
    <div className="min-w-0 rounded-2xl bg-hero-fg/8 px-3.5 py-2.5 ring-1 ring-hero-fg/10">
      <p className="flex items-center gap-1.5 text-xs text-hero-fg/65">
        <span className={`h-1.5 w-1.5 rounded-full ${tone === "pos" ? "bg-[oklch(0.78_0.16_158)]" : "bg-[oklch(0.78_0.15_50)]"}`} />
        {label}
      </p>
      <p className="tabular mt-0.5 truncate font-semibold">{value}</p>
    </div>
  );
}
