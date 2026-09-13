import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { createExpense, uploadReceipt, useGroup, type Member } from "../api";
import { useMe } from "../App";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Sheet } from "../components/Sheet";
import { Tabs } from "../components/Tabs";

// ponytail: backend has no GET /api/rates router yet (services/rates.py exists, no endpoint) — static list until it does
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CHF", "CNY", "SGD", "SEK", "NZD"];
const CATEGORIES = ["Groceries", "Food", "Rent", "Utilities", "Travel", "Other"];
const MODES = [
  { id: "equal", label: "Equal" },
  { id: "amounts", label: "Amounts" },
  { id: "percent", label: "Percent" },
  { id: "shares", label: "Shares" },
] as const;

type Mode = (typeof MODES)[number]["id"];

const selectClasses =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

/** Slide-over form to add an expense. Mounted conditionally (fresh state per open). */
export default function AddExpense({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { data: me } = useMe();
  const { data: group } = useGroup(groupId);
  const queryClient = useQueryClient();
  const members: Member[] = group?.members ?? [];

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [payerId, setPayerId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("equal");
  const [included, setIncluded] = useState<Set<number> | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [currency, setCurrency] = useState<string>(group?.currency ?? "USD");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const groupCurrency = group?.currency ?? "USD";
  const sameCurrency = currency === groupCurrency;
  const payer = payerId ?? me?.id ?? members[0]?.id ?? 0;
  const includeSet = included ?? new Set(members.map((m) => m.id));
  const amountMinor = Math.round((parseFloat(amount) || 0) * 100);

  const setValue = (id: number, v: string) => setValues((s) => ({ ...s, [id]: v }));

  function perMember(): { id: number; v: number }[] {
    return members.map((m) => ({ id: m.id, v: parseFloat(values[m.id] ?? "") || 0 }));
  }

  // Live "remaining / over" indicator; null when not applicable.
  function hint(): string | null {
    if (!amountMinor) return null;
    if (mode === "equal") return `Split evenly between ${includeSet.size} member${includeSet.size === 1 ? "" : "s"}`;
    if (mode === "amounts") {
      if (!sameCurrency) return null; // splits are computed on the converted total, unknown client-side
      const diff = amountMinor - perMember().reduce((a, x) => a + x.v * 100, 0);
      if (diff === 0) return "Splits match the total";
      const abs = Math.abs(diff) / 100;
      return diff > 0 ? `Remaining: ${abs.toFixed(2)} ${currency}` : `Over by: ${abs.toFixed(2)} ${currency}`;
    }
    if (mode === "percent") {
      const diff = 100 - perMember().reduce((a, x) => a + x.v, 0);
      if (Math.abs(diff) < 1e-6) return "Sums to 100%";
      return diff > 0 ? `Remaining: ${diff.toFixed(2)}%` : `Over by: ${Math.abs(diff).toFixed(2)}%`;
    }
    return null; // shares are weights — any positive integers are valid
  }

  function validate(): string {
    if (!description.trim()) return "Description is required";
    if (!(amountMinor > 0)) return "Amount must be greater than zero";
    if (mode === "equal" && includeSet.size === 0) return "Select at least one member";
    const rows = perMember();
    if (mode === "amounts" && sameCurrency) {
      const sum = rows.reduce((a, x) => a + x.v * 100, 0);
      if (Math.round(sum) !== amountMinor) return "Split amounts must sum to the expense total";
    }
    if (mode === "percent") {
      const sum = rows.reduce((a, x) => a + x.v, 0);
      if (Math.abs(sum - 100) > 1e-6) return "Percent splits must sum to 100";
    }
    if (mode === "shares") {
      if (rows.some((x) => !Number.isInteger(x.v) || x.v < 1)) return "Shares must be positive whole numbers";
    }
    return "";
  }

  const create = useMutation({
    mutationFn: async () => {
      const splits =
        mode === "equal"
          ? [...includeSet].map((user_id) => ({ user_id, mode: "equal" as const, value: null }))
          : members.map((m) => ({
              user_id: m.id,
              mode,
              value: mode === "amounts" ? (parseFloat(values[m.id] ?? "") || 0) : mode === "shares" ? parseInt(values[m.id] ?? "", 10) : (parseFloat(values[m.id] ?? "") || 0),
            }));
      const expense = await createExpense(groupId, {
        description: description.trim(),
        amount_minor: amountMinor,
        currency,
        payer_id: payer,
        splits,
        ...(date ? { date } : {}),
        ...(category ? { category } : {}),
      });
      if (file) await uploadReceipt(expense.id, file);
      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["debts", groupId] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    create.mutate();
  }

  const h = hint();

  return (
    <Sheet open onClose={onClose} title="Add expense">
      <form onSubmit={onSubmit} className="grid gap-4">
        <label className="grid gap-1.5 text-sm">
          Amount
          <div className="flex gap-2">
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={`${selectClasses} w-24`}
            >
              {[...new Set([groupCurrency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </label>

        <label className="grid gap-1.5 text-sm">
          Description
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={500}
            placeholder="What was it for?"
          />
        </label>

        <div className="grid gap-1.5 text-sm">
          Category
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? null : c)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  category === c
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border bg-card text-fg hover:bg-muted"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-1.5 text-sm">
          Paid by
          <select value={payer} onChange={(e) => setPayerId(Number(e.target.value))} className={selectClasses}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me?.id ? "You" : m.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-1.5 text-sm">
          Split
          <Tabs tabs={MODES.map((m) => ({ id: m.id, label: m.label }))} value={mode} onChange={(id) => setMode(id as Mode)} />
          {mode === "equal" ? (
            <ul className="grid gap-1">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeSet.has(m.id)}
                    onChange={() => {
                      const next = new Set(includeSet);
                      if (next.has(m.id)) next.delete(m.id);
                      else next.add(m.id);
                      setIncluded(next);
                    }}
                    className="h-4 w-4 accent-primary"
                    id={`inc-${m.id}`}
                  />
                  <label htmlFor={`inc-${m.id}`} className="cursor-pointer">
                    {m.id === me?.id ? "You" : m.name}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid gap-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-sm text-muted-fg">
                    {m.id === me?.id ? "You" : m.name}
                  </span>
                  <Input
                    type="number"
                    step={mode === "shares" ? "1" : "0.01"}
                    min="0"
                    placeholder={mode === "amounts" ? "0.00" : mode === "percent" ? "% of total" : "shares"}
                    value={values[m.id] ?? ""}
                    onChange={(e) => setValue(m.id, e.target.value)}
                  />
                </li>
              ))}
            </ul>
          )}
          {!sameCurrency && mode === "amounts" && (
            <p className="text-xs text-muted-fg">
              Splits are computed on the amount converted to {groupCurrency}; the backend validates the sum.
            </p>
          )}
          {h && <p className="text-xs text-muted-fg">{h}</p>}
        </div>

        <label className="grid gap-1.5 text-sm">
          Date <span className="text-muted-fg">(optional)</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="grid gap-1.5 text-sm">
          Receipt <span className="text-muted-fg">(png/jpg/webp/pdf, max 5MB)</span>
          <Input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="h-auto py-2 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Add expense"}
        </Button>
      </form>
    </Sheet>
  );
}
