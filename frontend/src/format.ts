/** Format integer minor units (cents) as a currency string. */
const formatters = new Map<string, Intl.NumberFormat>();

/** Currencies whose minor unit equals the major unit — no ÷100. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "XAF", "XOF"]);

export function formatMinor(amountMinor: number, currency: string): string {
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    });
    formatters.set(currency, fmt);
  }
  return fmt.format(ZERO_DECIMAL.has(currency) ? amountMinor : amountMinor / 100);
}

/** Currency symbol alone ("₹", "$"), for input prefixes. */
export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** Parse a user-typed amount ("1,234.5") into minor units; NaN-safe (0). */
export function parseMinor(input: string): number {
  const n = parseFloat(input.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** "2026-10-11" → local Date at midnight (avoids the UTC shift of new Date(iso)). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

/** "Today", "Yesterday", "Mon", or "12 Oct" (adds the year when not this year). */
export function dayLabel(day: string): string {
  if (day === todayIso()) return "Today";
  if (day === addDaysIso(-1)) return "Yesterday";
  const date = parseDay(day);
  const ageDays = (Date.now() - date.getTime()) / 86_400_000;
  if (ageDays > 0 && ageDays < 6) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

/** "October 2026" for a YYYY-MM-DD day. */
export function monthHeading(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Compact two-line date badge parts: { month: "Oct", day: "12" }. */
export function dateBadge(day: string): { month: string; day: string } {
  const d = parseDay(day);
  return { month: d.toLocaleDateString(undefined, { month: "short" }), day: String(d.getDate()) };
}

export function relativeTime(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  // backend timestamps are naive UTC
  const ts = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  const seconds = (Date.now() - ts) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (seconds >= secs) return rtf.format(-Math.floor(seconds / secs), unit);
  }
  return "just now";
}

/** Local calendar day of a naive-UTC backend timestamp. */
export function isoDay(iso: string): string {
  const ts = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return ts.toLocaleDateString("en-CA");
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

// ponytail: static subset of ECB reference currencies (backend converts any of them)
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD", "JPY", "CAD", "AUD", "CHF", "CNY", "THB", "SEK", "NZD"];
