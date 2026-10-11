import type { ReactNode } from "react";
import { BrandMark } from "./Brand";

/** Logged-out frame: navy brand panel (desktop) / header (mobile) + form card. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-hero p-12 text-hero-fg md:flex md:flex-col md:justify-between">
        <div className="flex items-center gap-3 text-xl font-bold">
          <BrandMark size={40} />
          Splitwise
        </div>
        <div className="relative z-10 max-w-md">
          <p className="text-4xl font-bold leading-tight tracking-tight">Split bills. Not friendships.</p>
          <p className="mt-4 text-lg text-hero-fg/70">
            Track shared expenses with housemates, trips and friends — then settle up in one tap with UPI.
          </p>
        </div>
        <HeroArt />
        <p className="relative z-10 text-sm text-hero-fg/50">Self-hosted · your data stays on your server</p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <BrandMark size={44} />
            <span className="text-2xl font-bold tracking-tight">Splitwise</span>
          </div>
          <h1 className="text-[1.75rem] font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-muted-fg">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-center text-sm text-muted-fg">{footer}</div>
        </div>
      </section>
    </main>
  );
}

/** Decorative stacked "balance" cards on the brand panel. */
function HeroArt() {
  const rows = [
    { name: "Goa trip", note: "Rahul owes you", amount: "₹6,140", tint: "var(--positive)" },
    { name: "Flat 302", note: "You owe Aman", amount: "₹1,250", tint: "var(--negative)" },
    { name: "Dinner", note: "Split 4 ways", amount: "₹8,640", tint: "var(--primary)" },
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-[11%] grid w-80 rotate-[-6deg] gap-3 opacity-90 lg:right-8">
      {rows.map((r, i) => (
        <div
          key={r.name}
          className="flex items-center gap-3 rounded-2xl bg-hero-fg/8 p-4 ring-1 ring-hero-fg/10 backdrop-blur"
          style={{ marginLeft: i * 28 }}
        >
          <span className="h-10 w-10 rounded-xl" style={{ background: `color-mix(in oklch, ${r.tint} 35%, transparent)` }} />
          <span className="flex-1">
            <span className="block text-sm font-semibold">{r.name}</span>
            <span className="block text-xs text-hero-fg/60">{r.note}</span>
          </span>
          <span className="font-semibold" style={{ color: r.tint }}>
            {r.amount}
          </span>
        </div>
      ))}
    </div>
  );
}
