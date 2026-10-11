import type { Friend, User } from "./api";
import { firstName, formatMinor } from "./format";
import { buildUpiUri, isValidVpa } from "./upi";

/** Positive = owed to you. Per-currency totals, never converted. */
export type Totals = Map<string, number>;

/** Sum friends' balances into what you're owed / what you owe, per currency. */
export function overallTotals(friends: Friend[]): { owed: Totals; owe: Totals } {
  const owed: Totals = new Map();
  const owe: Totals = new Map();
  for (const f of friends)
    for (const b of f.balances) {
      const into = b.amount > 0 ? owed : owe;
      into.set(b.currency, (into.get(b.currency) ?? 0) + Math.abs(b.amount));
    }
  return { owed, owe };
}

/** Your net position in each group (positive = you're owed), from the friends feed. */
export function groupNets(friends: Friend[]): Map<number, number> {
  const nets = new Map<number, number>();
  for (const f of friends)
    for (const g of f.groups) nets.set(g.group_id, (nets.get(g.group_id) ?? 0) + g.amount);
  return nets;
}

export function joinTotals(t: Totals): string {
  return [...t].map(([c, a]) => formatMinor(a, c)).join(" + ");
}

/** Copy for a settle-up reminder, with a one-tap UPI link when you have a UPI ID. */
export function reminderText(me: User, to: { name: string }, amountMinor: number, currency: string, context?: string) {
  const amount = formatMinor(amountMinor, currency);
  let text = `Hey ${firstName(to.name)}! Friendly reminder: you owe me ${amount}${context ? ` for ${context}` : ""} on Splitwise.`;
  if (currency === "INR" && me.upi_id && isValidVpa(me.upi_id)) {
    const uri = buildUpiUri({ vpa: me.upi_id, payeeName: me.name, amountMinor, note: context ? `Splitwise: ${context}` : "Splitwise" });
    text += `\n\nPay via UPI (${me.upi_id}): ${uri}`;
  }
  return text;
}

/** Native share sheet on phones; WhatsApp web fallback elsewhere. Resolves when handed off. */
export async function shareText(text: string): Promise<"shared" | "whatsapp" | "cancelled"> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return "whatsapp";
}
