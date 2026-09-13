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
