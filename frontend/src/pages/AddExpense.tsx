import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useMatch, useNavigate } from "react-router";
import {
  createExpense,
  invalidateGroup,
  updateExpense,
  uploadReceipt,
  useGroup,
  useGroups,
  type Expense,
  type Member,
} from "../api";
import { useMe } from "../App";
import { CATEGORIES, categoryFor, suggestCategory } from "../categories";
import { Avatar, GroupAvatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { CategoryTile } from "../components/CategoryTile";
import { Dialog } from "../components/Dialog";
import { CalendarIcon, CheckIcon, NoteIcon, PaperclipIcon, RepeatIcon } from "../components/icons";
import { FormError } from "../components/Input";
import { Tabs } from "../components/Tabs";
import { useToast } from "../components/Toast";
import { addDaysIso, CURRENCIES, dayLabel, formatMinor, parseDay, parseMinor, todayIso } from "../format";

const MODES = [
  { id: "equal", label: "Equally" },
  { id: "amounts", label: "Amounts" },
  { id: "percent", label: "%" },
  { id: "shares", label: "Shares" },
  { id: "itemized", label: "Items" },
] as const;
const FREQUENCIES = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
] as const;

type Mode = (typeof MODES)[number]["id"];
type Frequency = (typeof FREQUENCIES)[number]["id"];

/** Largest-remainder equal split, mirroring the backend (first members get the extra cent). */
function equalShares(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Prefill for editing: equal when every share is within a cent, else exact amounts. */
function initialSplit(expense: Expense | undefined): { mode: Mode; values: Record<number, string> } {
  if (!expense) return { mode: "equal", values: {} };
  const amounts = expense.splits.map((s) => s.amount_minor);
  if (Math.max(...amounts) - Math.min(...amounts) <= 1) return { mode: "equal", values: {} };
  return { mode: "amounts", values: Object.fromEntries(expense.splits.map((s) => [s.user_id, (s.amount_minor / 100).toFixed(2)])) };
}

/** Add (or edit, when `expense` is given) an expense. Bottom sheet on phones.
 *  Without `groupId` it starts with a group picker. Mounted conditionally (fresh state per open). */
export default function AddExpense({ groupId: fixedGroupId, expense, onClose }: { groupId?: string; expense?: Expense; onClose: () => void }) {
  const { data: me } = useMe();
  const groups = useGroups();
  const [pickedGroup, setPickedGroup] = useState<string | null>(null);
  const groupId = fixedGroupId ?? pickedGroup ?? (groups.data?.length === 1 ? String(groups.data[0].id) : "");
  const { data: group } = useGroup(groupId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const onGroupPage = useMatch(`/groups/${groupId}`);
  const toast = useToast();
  // me first, then everyone else in the group's order
  const members: Member[] = group ? [...group.members].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0)) : [];
  const groupCurrency = group?.currency ?? "INR";

  const [init] = useState(() => initialSplit(expense));
  const [amount, setAmount] = useState(expense ? String(expense.amount_minor / 100) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [category, setCategory] = useState<string | null>(expense?.category ?? null);
  const [categoryTouched, setCategoryTouched] = useState(!!expense?.category);
  const [pickCategory, setPickCategory] = useState(false);
  const [payerId, setPayerId] = useState<number | null>(expense?.payer_id ?? null);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [selected, setSelected] = useState<Set<number> | null>(expense ? new Set(expense.splits.map((s) => s.user_id)) : null);
  const [values, setValues] = useState<Record<number, string>>(init.values);
  const [currency, setCurrency] = useState<string | null>(expense?.currency ?? null);
  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!expense?.notes);
  const [repeat, setRepeat] = useState<Frequency | null>(null);
  const [error, setError] = useState("");

  const cur = currency ?? groupCurrency;
  const sameCurrency = cur === groupCurrency;
  const payer = payerId ?? me?.id ?? members[0]?.id ?? 0;
  const included = selected ?? new Set(members.map((m) => m.id));
  const rows = members.filter((m) => included.has(m.id));
  const amountMinor = parseMinor(amount);
  const shown = suggestCategory(description);
  const effectiveCategory = categoryTouched ? category : (shown ?? category);

  const perMember = () => rows.map((m) => ({ id: m.id, v: parseFloat(values[m.id] ?? "") || 0 }));
  const equal = equalShares(sameCurrency ? amountMinor : 0, rows.length);
  // amounts/items modes: what the typed per-person values add up to, in minor units
  const typedMinor = rows.reduce((a, m) => a + parseMinor(values[m.id] ?? ""), 0);
  // items mode: the part of the total nobody itemized (tax, tip, delivery…), shared equally
  const extras = amountMinor - typedMinor;
  const extraShares = equalShares(Math.max(extras, 0), rows.length);

  /** Status line under the split; `fix` offers to make the total match the splits. */
  function hint(): { text: string; ok: boolean; fix?: number } | null {
    if (mode === "amounts" && sameCurrency && typedMinor > 0 && !amountMinor)
      return { text: `Splits add up to ${formatMinor(typedMinor, cur)}`, ok: false, fix: typedMinor };
    if (!amountMinor) return null;
    if (mode === "equal")
      return rows.length === 0
        ? { text: "Pick at least one person", ok: false }
        : { text: `${formatMinor(Math.ceil(amountMinor / rows.length), cur)} each · ${rows.length} ${rows.length === 1 ? "person" : "people"}`, ok: true };
    if (mode === "amounts") {
      if (!sameCurrency) return { text: `Enter shares in ${groupCurrency} (the converted total)`, ok: true };
      const diff = amountMinor - typedMinor;
      if (diff === 0) return { text: "Adds up to the total", ok: true };
      return {
        text: diff > 0 ? `${formatMinor(diff, cur)} left to assign` : `${formatMinor(-diff, cur)} over the total`,
        ok: false,
        fix: typedMinor > 0 ? typedMinor : undefined,
      };
    }
    if (mode === "itemized") {
      if (!sameCurrency) return { text: `Enter items in ${groupCurrency} (the converted total)`, ok: true };
      if (extras < 0) return { text: `Items are ${formatMinor(-extras, cur)} more than the total`, ok: false, fix: typedMinor };
      if (extras === 0) return { text: "No shared extras — everyone pays their items", ok: true };
      const each = Math.ceil(extras / Math.max(rows.length, 1));
      return { text: `${formatMinor(extras, cur)} tax/fees shared · ${formatMinor(each, cur)} each`, ok: true };
    }
    if (mode === "percent") {
      const diff = 100 - perMember().reduce((a, x) => a + x.v, 0);
      if (Math.abs(diff) < 1e-6) return { text: "Adds up to 100%", ok: true };
      return { text: diff > 0 ? `${+diff.toFixed(2)}% left` : `${+(-diff).toFixed(2)}% over`, ok: false };
    }
    const total = perMember().reduce((a, x) => a + x.v, 0);
    return total > 0 ? { text: `${total} shares total`, ok: true } : null;
  }

  function validate(): string {
    if (!groupId) return "Choose a group";
    if (!description.trim()) return "Add a description";
    if (!(amountMinor > 0)) return "Enter an amount";
    if (rows.length === 0) return "Pick at least one person";
    const r = perMember();
    if (mode === "amounts" && sameCurrency && typedMinor !== amountMinor) return "Split amounts must add up to the total";
    if (mode === "itemized" && r.some((x) => x.v < 0)) return "Item amounts can't be negative";
    if (mode === "itemized" && sameCurrency && extras < 0) return "Items add up to more than the total";
    if (mode === "percent" && Math.abs(r.reduce((a, x) => a + x.v, 0) - 100) > 1e-6) return "Percentages must add up to 100";
    if (mode === "shares" && r.some((x) => !Number.isInteger(x.v) || x.v < 1)) return "Shares must be whole numbers of 1 or more";
    return "";
  }

  const save = useMutation({
    mutationFn: async () => {
      const splits =
        mode === "equal"
          ? rows.map((m) => ({ user_id: m.id, mode: "equal" as const, value: null }))
          : rows
              .map((m) => ({
                user_id: m.id,
                mode,
                value:
                  mode === "shares"
                    ? parseInt(values[m.id] ?? "", 10)
                    : mode === "amounts" || mode === "itemized"
                      ? parseMinor(values[m.id] ?? "")
                      : parseFloat(values[m.id] ?? "") || 0,
              }))
              // a blank/zero amount or % means "not part of this one" — no ₹0 split rows.
              // Items keep zeros: someone who ordered nothing still shares the extras.
              .filter((sp) => mode === "shares" || mode === "itemized" || sp.value > 0);
      const body = {
        description: description.trim(),
        amount_minor: amountMinor,
        currency: cur,
        payer_id: payer,
        splits,
        date,
        ...(effectiveCategory ? { category: effectiveCategory } : {}),
        notes: notes.trim() || null,
        // ponytail: edit path ignores recurring (backend PATCH doesn't support it)
        ...(!expense && repeat ? { recurring: { freq: repeat, day: parseDay(date).getDate() } } : {}),
      };
      const saved = expense ? await updateExpense(expense.id, body) : await createExpense(groupId, body);
      if (file) await uploadReceipt(saved.id, file);
      return saved;
    },
    onSuccess: (saved) => {
      invalidateGroup(queryClient, groupId);
      onClose();
      toast(expense ? "Expense updated" : `Added “${saved.description}”`, {
        action: !expense && !onGroupPage ? { label: "View", run: () => navigate(`/groups/${groupId}`) } : undefined,
      });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    setError("");
    save.mutate();
  }

  const h = hint();
  const invalid = validate() !== "";
  const toggle = (id: number) => {
    const next = new Set(included);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={expense ? "Edit expense" : "Add expense"}
      width="32rem"
      bodyClassName="px-5 pb-4 max-sm:px-4"
      footer={
        <div className="grid gap-2">
          <FormError>{error}</FormError>
          <Button type="submit" form="expense-form" size="lg" className="w-full" disabled={save.isPending || invalid}>
            {save.isPending ? "Saving…" : expense ? "Save changes" : amountMinor > 0 ? `Add ${formatMinor(amountMinor, cur)}` : "Add expense"}
          </Button>
        </div>
      }
    >
      <form id="expense-form" onSubmit={onSubmit} className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {!fixedGroupId && (
          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">Group</span>
            {groups.data?.length === 0 ? (
              <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-fg">Create a group first, then add expenses to it.</p>
            ) : (
              <div className="scroll-x -mx-1 gap-2 px-1 pb-0.5">
                {groups.data?.map((g) => {
                  const active = String(g.id) === groupId;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setPickedGroup(String(g.id));
                        setSelected(null);
                        setPayerId(null);
                        setValues({});
                      }}
                      className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl border p-1.5 pr-3.5 text-sm font-semibold transition-colors ${
                        active ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <GroupAvatar name={g.name} size={30} />
                      {g.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* What + how much */}
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPickCategory(!pickCategory)}
              aria-label={`Category: ${categoryFor(effectiveCategory).name}. Change`}
              aria-expanded={pickCategory}
              className="shrink-0 cursor-pointer rounded-[15px] ring-primary/40 transition hover:ring-4"
            >
              <CategoryTile category={effectiveCategory} size={50} />
            </button>
            <input
              aria-label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={500}
              placeholder="What was it for?"
              autoFocus={!expense}
              className="h-12 min-w-0 flex-1 border-0 border-b-2 border-border bg-transparent text-lg font-semibold placeholder:font-normal placeholder:text-muted-fg/70 focus-visible:border-primary focus-visible:outline-none"
            />
          </div>
          {pickCategory && (
            <div className="grid grid-cols-5 gap-1 rounded-2xl bg-muted p-2 max-[380px]:grid-cols-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  aria-pressed={effectiveCategory === c.name}
                  onClick={() => {
                    setCategory(c.name);
                    setCategoryTouched(true);
                    setPickCategory(false);
                  }}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[0.6875rem] font-medium transition-colors ${
                    effectiveCategory === c.name ? "bg-card shadow-card" : "hover:bg-card/60"
                  }`}
                >
                  <CategoryTile category={c.name} size={34} />
                  <span className="max-w-full truncate">{c.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <select
              aria-label="Currency"
              value={cur}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-[50px] w-[50px] shrink-0 cursor-pointer appearance-none rounded-[15px] border border-border bg-card text-center text-sm font-bold text-muted-fg hover:bg-muted"
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
              className="tabular h-14 min-w-0 flex-1 border-0 border-b-2 border-border bg-transparent text-[2.25rem] font-bold tracking-tight placeholder:text-muted-fg/40 focus-visible:border-primary focus-visible:outline-none"
            />
          </div>
          {!sameCurrency && <p className="text-xs text-muted-fg">Converted to {groupCurrency} at today's ECB rate when saved.</p>}
        </div>

        {/* Who paid */}
        {members.length > 0 && (
          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">Paid by</span>
            <div className="scroll-x -mx-1 gap-1.5 px-1 pb-0.5">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={payer === m.id}
                  onClick={() => setPayerId(m.id)}
                  className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors ${
                    payer === m.id ? "border-transparent bg-hero text-hero-fg" : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <Avatar name={m.name} size={26} pending={m.pending} />
                  {m.id === me?.id ? "You" : m.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Split */}
        {members.length > 0 && (
          <div className="grid gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">Split</span>
            <Tabs full tabs={MODES.map((m) => ({ id: m.id, label: m.label }))} value={mode} onChange={(id) => setMode(id as Mode)} label="Split mode" />
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {members.map((m) => {
                const on = included.has(m.id);
                const i = rows.findIndex((r) => r.id === m.id);
                return (
                  <li key={m.id} className={`flex items-center gap-3 px-3 py-2 transition-colors ${on ? "" : "bg-muted/50"}`}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`Include ${m.id === me?.id ? "yourself" : m.name}`}
                      onClick={() => toggle(m.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    >
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                          on ? "border-primary bg-primary text-primary-fg" : "border-border"
                        }`}
                      >
                        {on && <CheckIcon size={14} strokeWidth={3} />}
                      </span>
                      <Avatar name={m.name} size={30} pending={m.pending} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${on ? "font-medium" : "text-muted-fg"}`}>{m.id === me?.id ? "You" : m.name}</span>
                        {on && mode === "itemized" && sameCurrency && extras >= 0 && amountMinor > 0 && (
                          <span className="tabular block text-xs text-muted-fg">
                            pays {formatMinor(parseMinor(values[m.id] ?? "") + (extraShares[i] ?? 0), cur)}
                          </span>
                        )}
                      </span>
                    </button>
                    {on &&
                      (mode === "equal" ? (
                        <span className="tabular shrink-0 text-sm text-muted-fg">{sameCurrency && amountMinor > 0 ? formatMinor(equal[i] ?? 0, cur) : "—"}</span>
                      ) : (
                        <label className="flex shrink-0 items-center gap-1 rounded-lg bg-muted px-2">
                          <input
                            type="number"
                            step={mode === "shares" ? "1" : "0.01"}
                            min="0"
                            inputMode={mode === "shares" ? "numeric" : "decimal"}
                            autoComplete="off"
                            aria-label={`${m.id === me?.id ? "Your" : `${m.name}'s`} ${mode === "amounts" ? "amount" : mode === "itemized" ? "items" : mode === "percent" ? "percentage" : "shares"}`}
                            placeholder={mode === "shares" ? "1" : "0"}
                            value={values[m.id] ?? ""}
                            onChange={(e) => setValues((s) => ({ ...s, [m.id]: e.target.value }))}
                            className="tabular h-9 w-[4.5rem] border-0 bg-transparent text-right font-medium focus-visible:outline-none"
                          />
                          <span className="w-7 text-xs text-muted-fg">{mode === "amounts" || mode === "itemized" ? groupCurrency : mode === "percent" ? "%" : "×"}</span>
                        </label>
                      ))}
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-2 px-1 text-sm">
              <span className={h ? (h.ok ? "text-muted-fg" : "font-medium text-negative") : ""}>{h?.text}</span>
              <button
                type="button"
                className="shrink-0 cursor-pointer font-semibold text-primary-soft-fg hover:underline"
                onClick={() => setSelected(included.size === members.length ? new Set() : null)}
              >
                {included.size === members.length ? "Clear all" : "Select all"}
              </button>
            </div>
            {h?.fix !== undefined && h.fix !== amountMinor && (
              <button type="button" onClick={() => setAmount((h.fix! / 100).toFixed(2))} className="chipless w-fit">
                Use {formatMinor(h.fix, cur)} as the total
              </button>
            )}
            {mode === "itemized" && (
              <p className="px-1 text-xs text-muted-fg">
                Enter what each person ordered. Whatever's left of the total — tax, tip, delivery — is split equally between everyone ticked.
              </p>
            )}
          </div>
        )}

        {/* Extras */}
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {[todayIso(), addDaysIso(-1)].map((d) => (
              <button key={d} type="button" aria-pressed={date === d} onClick={() => setDate(d)} className="chipless">
                {dayLabel(d)}
              </button>
            ))}
            <label className={`chipless relative ${date !== todayIso() && date !== addDaysIso(-1) ? "is-on" : ""}`}>
              <CalendarIcon size={15} />
              {date !== todayIso() && date !== addDaysIso(-1) ? dayLabel(date) : "Pick date"}
              <input
                type="date"
                aria-label="Date"
                value={date}
                max={addDaysIso(365)}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={`chipless max-w-full ${file || expense?.receipt_path ? "is-on" : ""}`}>
              <PaperclipIcon size={15} />
              <span className="max-w-[10rem] truncate">{file ? file.name : expense?.receipt_path ? "Replace receipt" : "Receipt"}</span>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" aria-pressed={showNotes} onClick={() => setShowNotes(!showNotes)} className="chipless">
              <NoteIcon size={15} /> Notes
            </button>
            {!expense && (
              <button type="button" aria-pressed={!!repeat} onClick={() => setRepeat(repeat ? null : "monthly")} className="chipless">
                <RepeatIcon size={15} /> {repeat ? FREQUENCIES.find((f) => f.id === repeat)!.label : "Repeat"}
              </button>
            )}
          </div>
          {repeat && (
            <div className="grid gap-2 rounded-2xl bg-muted p-3">
              <Tabs full tabs={FREQUENCIES.map((f) => ({ id: f.id, label: f.label }))} value={repeat} onChange={(f) => setRepeat(f as Frequency)} label="Repeat frequency" />
              <p className="px-1 text-xs text-muted-fg">
                {repeat === "weekly"
                  ? `Every ${parseDay(date).toLocaleDateString(undefined, { weekday: "long" })}`
                  : repeat === "monthly"
                    ? `On day ${parseDay(date).getDate()} of every month`
                    : `Every ${parseDay(date).toLocaleDateString(undefined, { day: "numeric", month: "long" })}`}{" "}
                — added automatically with the same split.
              </p>
            </div>
          )}
          {showNotes && (
            <textarea
              aria-label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Add details — table number, what's included…"
              className="w-full resize-none rounded-2xl border border-border bg-card px-3.5 py-3 text-[0.9375rem] placeholder:text-muted-fg/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            />
          )}
        </div>
      </form>
    </Dialog>
  );
}
