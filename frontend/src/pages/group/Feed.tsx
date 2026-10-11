import { useDeferredValue, useState } from "react";
import type { Expense, Member, Settlement } from "../../api";
import { CategoryTile } from "../../components/CategoryTile";
import { EmptyState } from "../../components/EmptyState";
import { PaperclipIcon, ReceiptIcon, RepeatIcon, SearchIcon, XIcon } from "../../components/icons";
import { PaymentTile } from "../../components/PaymentTile";
import { dateBadge, firstName, formatMinor, monthHeading } from "../../format";

type Item = { kind: "expense"; date: string; id: number; expense: Expense } | { kind: "payment"; date: string; id: number; settlement: Settlement };

export function memberName(members: Member[] | undefined, id: number, meId?: number): string {
  if (id === meId) return "You";
  return members?.find((m) => m.id === id)?.name ?? "Former member";
}

/** Your side of an expense, in the group currency. */
export function myPosition(e: Expense, meId: number): { label: string; amount: number; tone: "pos" | "neg" | "none" } {
  const total = e.converted_amount_minor ?? e.amount_minor;
  const share = e.splits.find((s) => s.user_id === meId)?.amount_minor ?? 0;
  if (e.payer_id === meId) {
    const lent = total - share;
    return lent > 0 ? { label: "you lent", amount: lent, tone: "pos" } : { label: "you paid", amount: total, tone: "none" };
  }
  return share > 0 ? { label: "you borrowed", amount: share, tone: "neg" } : { label: "not involved", amount: 0, tone: "none" };
}

function DateBadge({ date }: { date: string }) {
  const { month, day } = dateBadge(date);
  return (
    <span className="flex w-9 shrink-0 flex-col items-center leading-none text-muted-fg" aria-hidden="true">
      <span className="text-[0.6875rem] font-medium uppercase">{month}</span>
      <span className="tabular mt-0.5 text-lg font-semibold text-fg/80">{day}</span>
    </span>
  );
}

function ExpenseRow({ expense, members, meId, currency, onOpen }: { expense: Expense; members: Member[]; meId: number; currency: string; onOpen: () => void }) {
  const pos = myPosition(expense, meId);
  const total = expense.converted_amount_minor ?? expense.amount_minor;
  const payer = memberName(members, expense.payer_id, meId);
  const foreign = expense.currency !== currency;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="pressable flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-muted"
      >
        <DateBadge date={expense.date} />
        <CategoryTile category={expense.category} size={42} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{expense.description}</span>
            {expense.recurring_rule_id != null && <RepeatIcon size={13} className="shrink-0 text-muted-fg" />}
            {expense.receipt_path && <PaperclipIcon size={13} className="shrink-0 text-muted-fg" />}
          </span>
          <span className="block truncate text-sm text-muted-fg">
            {payer === "You" ? "You" : firstName(payer)} paid{" "}
            <span className="tabular">{formatMinor(foreign ? expense.amount_minor : total, expense.currency)}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-xs ${pos.tone === "pos" ? "text-positive" : pos.tone === "neg" ? "text-negative" : "text-muted-fg"}`}>
            {pos.label}
          </span>
          {pos.amount > 0 && (
            <span className={`tabular block font-semibold ${pos.tone === "pos" ? "text-positive" : pos.tone === "neg" ? "text-negative" : ""}`}>
              {formatMinor(pos.amount, currency)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function PaymentRow({ settlement, members, meId, currency, onOpen }: { settlement: Settlement; members: Member[]; meId: number; currency: string; onOpen: () => void }) {
  const payer = memberName(members, settlement.payer_id, meId);
  const payee = memberName(members, settlement.payee_id, meId);
  const mine = settlement.payer_id === meId || settlement.payee_id === meId;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="pressable flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-muted"
      >
        <DateBadge date={settlement.date} />
        <PaymentTile pending={settlement.pending} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {payer} paid {payee === "You" ? "you" : payee}
          </span>
          {settlement.pending ? (
            <span className="block truncate text-sm font-medium text-primary-soft-fg">
              {settlement.payee_id === meId ? "Confirm you received it" : `Waiting for ${payee === "You" ? "you" : firstName(payee)} to confirm`}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-muted-fg">
              Payment {settlement.proof_path && <><PaperclipIcon size={12} /> proof</>}
            </span>
          )}
        </span>
        <span className={`tabular shrink-0 font-semibold ${settlement.pending ? "text-muted-fg" : mine ? "text-positive" : "text-muted-fg"}`}>
          {formatMinor(settlement.amount_minor, currency)}
        </span>
      </button>
    </li>
  );
}

/** Expenses and payments interleaved, newest first, under month headings. */
export function Feed({
  expenses,
  settlements,
  members,
  meId,
  currency,
  onOpenExpense,
  onOpenPayment,
  onAdd,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  members: Member[];
  meId: number;
  currency: string;
  onOpenExpense: (e: Expense) => void;
  onOpenPayment: (s: Settlement) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());

  const matches = (e: Expense) =>
    !q ||
    [e.description, e.notes ?? "", e.category ?? "", memberName(members, e.payer_id)].some((s) => s.toLowerCase().includes(q)) ||
    String((e.converted_amount_minor ?? e.amount_minor) / 100).includes(q);

  const items: Item[] = [
    ...expenses.filter(matches).map((e) => ({ kind: "expense" as const, date: e.date, id: e.id, expense: e })),
    ...(q ? [] : settlements.map((s) => ({ kind: "payment" as const, date: s.date, id: s.id, settlement: s }))),
  ].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));

  const byMonth = new Map<string, Item[]>();
  for (const it of items) {
    const key = it.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), it]);
  }

  if (expenses.length === 0 && settlements.length === 0)
    return (
      <EmptyState
        icon={ReceiptIcon}
        title="No expenses yet"
        description="Add the first one — who paid, and who it's for. Balances update instantly."
        action={
          <button type="button" onClick={onAdd} className="h-11 cursor-pointer rounded-full bg-primary px-5 font-semibold text-primary-fg">
            Add an expense
          </button>
        }
      />
    );

  return (
    <div>
      {expenses.length > 4 && (
        <label className="relative mb-2 block">
          <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-fg" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search expenses"
            aria-label="Search expenses"
            className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-10 text-[0.9375rem] placeholder:text-muted-fg/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-fg hover:bg-muted"
            >
              <XIcon size={16} />
            </button>
          )}
        </label>
      )}
      {items.length === 0 ? (
        <p className="px-2 py-10 text-center text-sm text-muted-fg">No expenses match “{query}”.</p>
      ) : (
        [...byMonth.entries()].map(([month, list]) => (
          <section key={month} className="mt-3 first:mt-0">
            <h3 className="sticky top-0 z-[1] -mx-1 bg-bg/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-fg backdrop-blur md:static md:bg-transparent">
              {monthHeading(list[0].date)}
            </h3>
            <ul className="-mx-2 grid grid-cols-[minmax(0,1fr)]">
              {list.map((it) =>
                it.kind === "expense" ? (
                  <ExpenseRow
                    key={`e${it.id}`}
                    expense={it.expense}
                    members={members}
                    meId={meId}
                    currency={currency}
                    onOpen={() => onOpenExpense(it.expense)}
                  />
                ) : (
                  <PaymentRow
                    key={`p${it.id}`}
                    settlement={it.settlement}
                    members={members}
                    meId={meId}
                    currency={currency}
                    onOpen={() => onOpenPayment(it.settlement)}
                  />
                ),
              )}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
