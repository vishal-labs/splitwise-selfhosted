import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  createExpense,
  updateExpense,
  uploadReceipt,
  useGroup,
  type Expense,
  type Member,
} from "../api";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { XIcon } from "../components/icons";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
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
const FREQUENCIES = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
] as const;

type Mode = (typeof MODES)[number]["id"];
type Frequency = (typeof FREQUENCIES)[number]["id"];

const chipClasses = (active: boolean) =>
  `shrink-0 cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
    active
      ? "border-primary bg-primary text-primary-fg"
      : "border-border bg-card text-fg hover:bg-muted"
  }`;

const inlineSelect =
  "cursor-pointer rounded-lg border-0 bg-transparent px-1 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

const chipless =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-3 text-sm text-muted-fg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

const borderlessSelect =
  "cursor-pointer rounded-lg border-0 bg-transparent px-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

function Paperclip() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/** Centered modal (bottom sheet on mobile) to add (or edit, when `expense` is given) an expense. Mounted conditionally (fresh state per open). */
export default function AddExpense({
  groupId,
  expense,
  onClose,
}: {
  groupId: string;
  /** When set, the form is prefilled and submits a PATCH instead of a POST. */
  expense?: Expense;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const { data: group } = useGroup(groupId);
  const queryClient = useQueryClient();
  const members: Member[] = group?.members ?? [];

  const [amount, setAmount] = useState(
    expense ? String((expense.converted_amount_minor ?? expense.amount_minor) / 100) : "",
  );
  const [description, setDescription] = useState(expense?.description ?? "");
  const [category, setCategory] = useState<string | null>(expense?.category ?? null);
  const [payerId, setPayerId] = useState<number | null>(expense?.payer_id ?? null);
  const [mode, setMode] = useState<Mode>("equal");
  const [included, setIncluded] = useState<Set<number> | null>(null);
  // Members listed in amounts/percent/shares rows; null = "all" default (edit mode: existing splits).
  const [splitMembers, setSplitMembers] = useState<Set<number> | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [currency, setCurrency] = useState<string>(expense?.currency ?? group?.currency ?? "USD");
  const [date, setDate] = useState(expense?.date ?? new Date().toLocaleDateString("en-CA")); // YYYY-MM-DD, local time
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  // ponytail: repeat UI only — backend has no recurrence field yet; wire into the POST body when it does
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [repeatDay, setRepeatDay] = useState("1");

  const groupCurrency = group?.currency ?? "USD";
  const sameCurrency = currency === groupCurrency;
  const payer = payerId ?? me?.id ?? members[0]?.id ?? 0;
  // ponytail: edits prefill as equal-split over the expense's split members; per-mode prefill not worth it
  const includeSet =
    included ?? new Set(expense ? expense.splits.map((s) => s.user_id) : members.map((m) => m.id));
  const splitSet =
    splitMembers ?? new Set(expense ? expense.splits.map((s) => s.user_id) : members.map((m) => m.id));
  const splitRows = members.filter((m) => splitSet.has(m.id));
  const amountMinor = Math.round((parseFloat(amount) || 0) * 100);
  const payerName = members.find((m) => m.id === payer)?.name ?? me?.name ?? "?";

  const setValue = (id: number, v: string) => setValues((s) => ({ ...s, [id]: v }));

  function perMember(): { id: number; v: number }[] {
    return splitRows.map((m) => ({ id: m.id, v: parseFloat(values[m.id] ?? "") || 0 }));
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

  const save = useMutation({
    mutationFn: async () => {
      const splits =
        mode === "equal"
          ? [...includeSet].map((user_id) => ({ user_id, mode: "equal" as const, value: null }))
          : splitRows.map((m) => ({
              user_id: m.id,
              mode,
              value: mode === "amounts" ? (parseFloat(values[m.id] ?? "") || 0) : mode === "shares" ? parseInt(values[m.id] ?? "", 10) : (parseFloat(values[m.id] ?? "") || 0),
            }));
      const body = {
        description: description.trim(),
        amount_minor: amountMinor,
        currency,
        payer_id: payer,
        splits,
        ...(date ? { date } : {}),
        ...(category ? { category } : {}),
        // ponytail: edit path ignores recurring (backend PATCH doesn't support it)
        ...(!expense && repeat
          ? { recurring: { freq: frequency, day: parseInt(repeatDay, 10) || 1 } }
          : {}),
      };
      const saved = expense
        ? await updateExpense(expense.id, body)
        : await createExpense(groupId, body);
      if (file) await uploadReceipt(saved.id, file);
      return saved;
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
    save.mutate();
  }

  const h = hint();
  const invalid = validate() !== "";

  return (
    <Dialog
      open
      onClose={onClose}
      title={expense ? "Edit expense" : "Add expense"}
      className="expense-modal flex flex-col overflow-hidden"
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-0"
    >
      <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
        <div className="grid gap-5 px-5 pb-5 pt-4 max-sm:gap-4 max-sm:px-4 max-sm:pb-4 max-sm:pt-3">
          {/* Amount hero: tap the big number to type */}
          <div className="flex items-center justify-center gap-1 border-b border-border pb-4 max-sm:pb-3">
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={`${borderlessSelect} h-12 text-lg text-muted-fg`}
            >
              {[...new Set([groupCurrency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Amount"
              placeholder="0.00"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="amount-input h-16 w-full max-w-[13rem] border-0 bg-transparent text-center text-4xl font-semibold tabular-nums text-fg placeholder:text-muted-fg/60 focus-visible:outline-none max-sm:h-14 max-sm:text-3xl"
            />
          </div>

          <input
            aria-label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={500}
            placeholder="Add a description"
            className="h-12 w-full rounded-lg border border-border bg-card px-3 text-lg text-fg placeholder:text-muted-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring max-sm:h-11 max-sm:text-base"
          />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-fg">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-fg">Category</span>
              <select
                aria-label="Category"
                value={category ?? ""}
                onChange={(e) => setCategory(e.target.value || null)}
                className={`${inlineSelect} menu-select h-9 text-sm`}
              >
                <button>
                  <selectedcontent />
                </button>
                <option value="">None</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-fg">Paid by</span>
              <Avatar name={payerName} size={24} />
              <select
                aria-label="Paid by"
                value={payer}
                onChange={(e) => setPayerId(Number(e.target.value))}
                className={`${inlineSelect} menu-select h-9 text-sm`}
              >
                <button>
                  <selectedcontent />
                </button>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === me?.id ? "You" : m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2 text-sm">
            <span className="text-muted-fg">Split</span>
            <Tabs pills tabs={MODES.map((m) => ({ id: m.id, label: m.label }))} value={mode} onChange={(id) => setMode(id as Mode)} />
            {mode === "equal" ? (
              <div className="flex flex-wrap justify-center gap-1.5">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={includeSet.has(m.id)}
                    onClick={() => {
                      const next = new Set(includeSet);
                      if (next.has(m.id)) next.delete(m.id);
                      else next.add(m.id);
                      setIncluded(next);
                    }}
                    className={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                      includeSet.has(m.id)
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-border bg-card text-fg hover:bg-muted"
                    }`}
                  >
                    <Avatar name={m.name} size={20} />
                    {m.id === me?.id ? "You" : m.name}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <ul className="grid gap-1.5">
                  {splitRows.map((m) => (
                    <li key={m.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5">
                      <Avatar name={m.name} size={22} />
                      <span className="min-w-0 flex-1 truncate">
                        {m.id === me?.id ? "You" : m.name}
                      </span>
                      <input
                        type="number"
                        step={mode === "shares" ? "1" : "0.01"}
                        min="0"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`${m.id === me?.id ? "Your" : `${m.name}'s`} ${mode === "amounts" ? "amount" : mode === "percent" ? "percentage" : "shares"}`}
                        placeholder={mode === "amounts" ? "0.00" : mode === "percent" ? "0" : "0"}
                        value={values[m.id] ?? ""}
                        onChange={(e) => setValue(m.id, e.target.value)}
                        className="h-8 w-20 shrink-0 border-0 bg-transparent text-right tabular-nums text-fg placeholder:text-muted-fg/60 focus-visible:outline-none"
                      />
                      <span className="w-12 shrink-0 text-right text-xs text-muted-fg">
                        {mode === "amounts" ? currency : mode === "percent" ? "%" : "share(s)"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${m.id === me?.id ? "yourself" : m.name} from split`}
                        disabled={splitSet.size <= 1}
                        onClick={() => {
                          const next = new Set(splitSet);
                          next.delete(m.id);
                          setSplitMembers(next);
                        }}
                        className="shrink-0 cursor-pointer px-0.5 text-muted-fg hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <XIcon size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                {splitRows.length < members.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {members
                      .filter((m) => !splitSet.has(m.id))
                      .map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            const next = new Set(splitSet);
                            next.add(m.id);
                            setSplitMembers(next);
                          }}
                          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-fg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <Avatar name={m.name} size={20} />
                          {m.id === me?.id ? "You" : m.name}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
            {!sameCurrency && mode === "amounts" && (
              <p className="text-xs text-muted-fg">
                Splits are computed on the amount converted to {groupCurrency}; the backend validates the sum.
              </p>
            )}
            {h && <p className="text-center text-xs text-muted-fg">{h}</p>}
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <input
                type="date"
                aria-label="Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${chipless} cursor-pointer font-medium`}
              />
              <label className={`${chipless} max-w-full`}>
                <Paperclip />
                <span className="max-w-[9rem] truncate font-medium">{file ? file.name : "Receipt"}</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button type="button" aria-pressed={repeat} onClick={() => setRepeat(!repeat)} className={`${chipless} font-medium ${repeat ? "text-fg" : ""}`}>
                Repeat
              </button>
            </div>
            {repeat && (
              <div className="flex flex-wrap items-center gap-1.5">
                {FREQUENCIES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFrequency(f.id)}
                    className={chipClasses(frequency === f.id)}
                  >
                    {f.label}
                  </button>
                ))}
                {frequency === "weekly" ? (
                  <select
                    aria-label="Day of week"
                    value={repeatDay}
                    onChange={(e) => setRepeatDay(e.target.value)}
                    className={`${inlineSelect} h-9 text-sm`}
                  >
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    aria-label="Day of month"
                    min="1"
                    max="31"
                    inputMode="numeric"
                    value={repeatDay}
                    onChange={(e) => setRepeatDay(e.target.value)}
                    className="h-9 w-16 rounded-lg border-0 bg-transparent px-1 text-center text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-card px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={save.isPending || invalid} className="w-full">
            {save.isPending ? "Saving…" : expense ? "Save changes" : "Add expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
