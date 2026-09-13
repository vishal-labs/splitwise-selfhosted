/** Format integer minor units (cents) as a currency string. */
const formatters = new Map<string, Intl.NumberFormat>();

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
  return fmt.format(amountMinor / 100);
}
