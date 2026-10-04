import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import {
  addComment,
  addMember,
  cancelRecurring,
  createSettlement,
  deleteExpense,
  deleteGroup,
  getComments,
  removeMember,
  settlementProofUrl,
  uploadSettlementProof,
  upiQrUrl,
  useGroup,
  useGroupDebts,
  useGroupExpenses,
  useGroupSettlements,
  type Comment,
  type Debt,
  type Expense,
  type Member,
  type Settlement,
} from "../api";
import { buildUpiUri, isValidVpa } from "../upi";
import UpiQr from "../components/UpiQr";
import { useMe } from "../App";
import { Attachment } from "../components/Attachment";
import { Avatar } from "../components/Avatar";
import { CheckIcon, CopyIcon, PencilIcon, PlusIcon, RepeatIcon, TrashIcon, XIcon, PaperclipIcon } from "../components/icons";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { ApiError } from "../api";
import { ErrorState } from "../components/ErrorState";
import { Input } from "../components/Input";
import { PaymentForm } from "../components/PaymentForm";
import { Sheet } from "../components/Sheet";
import { Tabs } from "../components/Tabs";
import { formatMinor } from "../format";
import AddExpense from "./AddExpense";

function memberName(members: Member[] | undefined, id: number): string {
  const m = members?.find((m) => m.id === id);
  return m?.name ?? `User ${id}`;
}

function ExpenseRow({
  expense,
  members,
  myId,
  myRole,
  onEdit,
}: {
  expense: Expense;
  members: Member[];
  myId: number;
  myRole: string;
  onEdit: (e: Expense) => void;
}) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [ruleConfirm, setRuleConfirm] = useState(false);
  const [detail, setDetail] = useState(false);
  const groupId = expense.group_id;

  const del = useMutation({
    mutationFn: () => deleteExpense(expense.id),
    onSuccess: () => {
      // route param is a string; keys must match useGroupExpenses/useGroupDebts or nothing refetches
      queryClient.invalidateQueries({ queryKey: ["expenses", String(groupId)] });
      queryClient.invalidateQueries({ queryKey: ["debts", String(groupId)] });
    },
  });

  const cancelRule = useMutation({
    mutationFn: () => cancelRecurring(groupId, expense.recurring_rule_id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", String(groupId)] });
      setRuleConfirm(false);
    },
  });

  const canEdit = expense.created_by === myId || myRole === "admin";
  const myShare = expense.splits.find((s) => s.user_id === myId)?.amount_minor ?? 0;
  const total = expense.converted_amount_minor ?? expense.amount_minor;

  return (
    <li className="flex items-center gap-2 px-1 py-3">
      <button
        type="button"
        onClick={() => setDetail(true)}
        className="min-w-0 flex-1 cursor-pointer text-left"
        aria-label={`View ${expense.description}`}
      >
        <p className="truncate font-medium">{expense.description}</p>
        <p className="truncate text-sm text-muted-fg">
          {memberName(members, expense.payer_id)} paid · your share{" "}
          {formatMinor(myShare, expense.currency)}
        </p>
      </button>
      <span className="shrink-0 font-medium tabular-nums">{formatMinor(total, expense.currency)}</span>
      <span className="flex shrink-0 items-center gap-0.5">
      {expense.recurring_rule_id != null &&
        (canEdit ? (
          ruleConfirm ? (
            <span className="flex items-center gap-1">
              <Button
                variant="danger"
                className="h-8 px-2 text-sm"
                disabled={cancelRule.isPending}
                onClick={() => cancelRule.mutate()}
              >
                {cancelRule.isPending ? "…" : "Cancel rule"}
              </Button>
              <Button variant="ghost" className="h-8 px-2 text-sm" onClick={() => setRuleConfirm(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cancel recurring rule"
              className="h-8"
              onClick={() => setRuleConfirm(true)}
            >
              <RepeatIcon size={15} />
            </Button>
          )
        ) : (
          <span title="Recurring expense" className="flex items-center px-1 text-muted-fg">
            <RepeatIcon size={15} />
          </span>
        ))}
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${expense.description}`}
          className="h-8 text-sm text-muted-fg"
          onClick={() => onEdit(expense)}
        >
          <PencilIcon size={15} />
        </Button>
      )}
      {canEdit &&
        (confirm ? (
          <span className="flex items-center gap-1">
            <Button
              variant="danger"
              className="h-8 px-2 text-sm"
              disabled={del.isPending}
              onClick={() => del.mutate()}
            >
              {del.isPending ? "…" : "Delete"}
            </Button>
            <Button variant="ghost" className="h-8 px-2 text-sm" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${expense.description}`}
            className="h-8 text-sm text-muted-fg"
            onClick={() => setConfirm(true)}
          >
            <XIcon size={15} />
          </Button>
        ))}
      </span>
      {detail && <ExpenseDetail expense={expense} members={members} onClose={() => setDetail(false)} />}
    </li>
  );
}

function ExpenseDetail({
  expense,
  members,
  onClose,
}: {
  expense: Expense;
  members: Member[];
  onClose: () => void;
}) {
  const { data: comments, isPending } = useQuery({
    queryKey: ["comments", expense.id],
    queryFn: () => getComments(expense.id),
  });
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  const add = useMutation({
    mutationFn: () => addComment(expense.id, body.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", expense.id] });
      setBody("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim()) return;
    setError("");
    add.mutate();
  }

  const total = expense.converted_amount_minor ?? expense.amount_minor;

  return (
    <Sheet open onClose={onClose} title={expense.description}>
      <div className="grid gap-5">
        <p className="text-sm text-muted-fg">
          {memberName(members, expense.payer_id)} paid {formatMinor(total, expense.currency)}
          {expense.category ? ` · ${expense.category}` : ""} · {expense.date}
        </p>

        <div className="grid gap-1 text-sm">
          <h3 className="font-medium">Splits</h3>
          <ul className="grid gap-1.5">
            {expense.splits.map((s) => (
              <li
                key={s.user_id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5"
              >
                <Avatar name={memberName(members, s.user_id)} size={22} />
                <span className="min-w-0 flex-1 truncate">
                  {memberName(members, s.user_id)}
                </span>
                <span className="shrink-0 text-right font-medium tabular-nums">
                  {formatMinor(s.amount_minor, expense.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Receipt expenseId={expense.id} receiptPath={expense.receipt_path} />

        <div className="grid gap-2 text-sm">
          <h3 className="font-medium">Comments</h3>
          {isPending ? (
            <p className="text-muted-fg">Loading…</p>
          ) : !comments || comments.length === 0 ? (
            <p className="text-muted-fg">No comments yet.</p>
          ) : (
            <ul className="grid gap-2">
              {comments.map((c: Comment) => (
                <li key={c.id} className="rounded-card border border-border bg-card px-3 py-2">
                  <p>{c.body}</p>
                  <p className="text-xs text-muted-fg">
                    {memberName(members, c.user_id)} · {new Date(c.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
              maxLength={2000}
              aria-label="Add a comment"
            />
            <Button type="submit" disabled={add.isPending || !body.trim()}>
              {add.isPending ? "…" : "Post"}
            </Button>
          </form>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** Receipt viewer; renders nothing when the expense has no receipt. */
function Receipt({ expenseId, receiptPath }: { expenseId: number; receiptPath: string | null }) {
  if (!receiptPath) return null;
  // fetch with cookie session via credentials: include
  return (
    <div className="grid gap-1 text-sm">
      <h3 className="font-medium">Receipt</h3>
      <Attachment
        url={`/api/expenses/${expenseId}/receipt`}
        path={receiptPath}
        alt="Receipt"
        linkLabel="Open receipt (PDF)"
      />
    </div>
  );
}

function ExpensesTab({
  groupId,
  myId,
  myRole,
  onEdit,
}: {
  groupId: string;
  myId: number;
  myRole: string;
  onEdit: (e: Expense) => void;
}) {
  const { data: group } = useGroup(groupId);
  const { data: expenses, isPending, isError, refetch } = useGroupExpenses(groupId);
  const members = group?.members;

  if (isPending) return <p className="text-muted-fg">Loading…</p>;
  if (isError)
    return <ErrorState description="Couldn't load expenses." action={() => void refetch()} />;
  if (!expenses || expenses.length === 0)
    return (
      <EmptyState
        title="No expenses yet"
        description="Add your first expense to start tracking balances."
      />
    );

  // group by date, desc (API already sorts desc)
  const byDate = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  return (
    <div className="grid gap-6">
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date} className="min-w-0">
          <h3 className="text-sm font-medium text-muted-fg">{date}</h3>
          <ul className="divide-y divide-border">
            {list.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                members={members ?? []}
                myId={myId}
                myRole={myRole}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MemberProfileDialog({
  member,
  groupName,
  onClose,
}: {
  member: Member;
  groupName: string;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const [copied, setCopied] = useState(false);
  const vpa = member.upi_id && isValidVpa(member.upi_id) ? member.upi_id : null;

  async function copy() {
    if (!vpa) return;
    await navigator.clipboard.writeText(vpa);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (me && member.id === me.id) {
    return (
      <Dialog open onClose={onClose} title="Your payment details">
        <PaymentForm me={me} />
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={member.name}>
      {!vpa && !member.has_upi_qr ? (
        <p className="text-sm text-muted-fg">No UPI set up</p>
      ) : (
        <div className="grid gap-4">
          {vpa && (
            <div className="flex items-center justify-between gap-2 rounded-card border border-border bg-card p-3">
              <span className="min-w-0 truncate text-sm">{vpa}</span>
              <Button variant="secondary" onClick={() => void copy()}>
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                <span className="max-sm:hidden">{copied ? "Copied" : "Copy UPI ID"}</span>
              </Button>
            </div>
          )}
          {vpa ? (
            <UpiQr
              value={buildUpiUri({ vpa, payeeName: member.name, note: `Splitwise: ${groupName}` })}
              caption={member.name}
            />
          ) : (
            <img
              src={upiQrUrl(member.id)}
              alt={`${member.name} UPI QR`}
              className="mx-auto max-h-64 max-w-full rounded-card border border-border object-contain"
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

function SettleUpDialog({
  groupId,
  currency,
  debts,
  onClose,
}: {
  groupId: string;
  currency: string;
  debts: Debt[];
  onClose: () => void;
}) {
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [payeeId, setPayeeId] = useState<number | null>(null);
  // null until the user edits; the field follows the selected payee's debt
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [pendingProof, setPendingProof] = useState<number | null>(null);

  const settle = useMutation({
    mutationFn: async (body: { payer_id: number; payee_id: number; amount_minor: number }) => {
      const settlement = await createSettlement(groupId, { ...body, currency });
      // settlement exists the moment create resolves — proof is a separate,
      // non-blocking step so a failed upload can't cause a double-record
      let proofFailed = false;
      if (proof) {
        try {
          await uploadSettlementProof(settlement.id, proof);
        } catch {
          proofFailed = true;
        }
      }
      return { settlement, proofFailed };
    },
    onSuccess: ({ settlement, proofFailed }) => {
      queryClient.invalidateQueries({ queryKey: ["debts", groupId] });
      queryClient.invalidateQueries({ queryKey: ["settlements", groupId] });
      if (proofFailed) {
        // keep the dialog open: settlement is done, let them retry the proof
        setError(`Payment recorded — proof upload failed. Retry below (settlement #${settlement.id}).`);
        setPendingProof(settlement.id);
        setProof(null);
      } else {
        onClose();
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  const retryProof = useMutation({
    mutationFn: () => uploadSettlementProof(pendingProof!, proof!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debts", groupId] });
      queryClient.invalidateQueries({ queryKey: ["settlements", groupId] });
      onClose();
    },
    onError: (e) =>
      setError(
        `Payment recorded — proof upload failed: ${e instanceof Error ? e.message : "unknown error"}`,
      ),
  });

  const myDebts = me ? debts.filter((d) => d.from === me.id) : [];
  const defaultPayeeId =
    myDebts[0]?.to ?? group?.members.find((m) => m.id !== me?.id)?.id ?? null;
  const selectedPayeeId = payeeId ?? defaultPayeeId;
  const payee = group?.members.find((m) => m.id === selectedPayeeId);
  const selectedDebt = myDebts.find((d) => d.to === selectedPayeeId);
  const amount = amountOverride ?? (selectedDebt ? (selectedDebt.amount / 100).toFixed(2) : "");
  const amountMinor = Math.round((parseFloat(amount) || 0) * 100);
  const payeeVpa = payee?.upi_id && isValidVpa(payee.upi_id) ? payee.upi_id : null;
  const note = `Splitwise settle up: ${me?.name ?? ""} -> ${payee?.name ?? ""} . ${group?.name ?? ""}`.slice(0, 50);
  const showUpi = amountMinor > 0 && !!payee && (!!payeeVpa || payee.has_upi_qr);
  const uri = payeeVpa ? buildUpiUri({ vpa: payeeVpa, payeeName: payee?.name ?? "", amountMinor, note }) : "";

  async function copyVpa() {
    if (!payeeVpa) return;
    await navigator.clipboard.writeText(payeeVpa);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (!(amountMinor > 0)) {
      setError("Amount must be greater than zero");
      return;
    }
    settle.mutate({
      payer_id: Number(data.get("payer_id")),
      payee_id: selectedPayeeId ?? 0,
      amount_minor: amountMinor,
    });
  }

  return (
    <Dialog open onClose={onClose} title="Settle up">
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-fg">
          <label className="flex items-center gap-1.5">
            <span className="text-muted-fg">Paid by</span>
            <Avatar name={me?.name ?? ""} size={22} />
            <span className="font-medium text-fg">You</span>
            <input type="hidden" name="payer_id" value={me?.id ?? ""} />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-fg">To</span>
            <select
              name="payee_id"
              value={selectedPayeeId ?? ""}
              onChange={(e) => {
                setPayeeId(Number(e.target.value));
                setAmountOverride(null);
              }}
              className="menu-select h-9 text-sm"
              required
            >
              <button>
                <selectedcontent />
              </button>
              {group?.members
                .filter((m) => m.id !== me?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="grid gap-1.5 text-sm">
          Amount ({currency})
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            autoComplete="off"
            required
            value={amount}
            onChange={(e) => setAmountOverride(e.target.value)}
          />
        </label>
        {showUpi && payee && (
          <div className="grid gap-3 rounded-card border border-border bg-card p-4">
            <p className="text-sm font-medium">Pay via UPI</p>
            {payeeVpa ? (
              <>
                <div className="hidden justify-items-center gap-3 sm:grid">
                  <UpiQr value={uri} caption={payee.name} />
                  <Button variant="secondary" onClick={() => void copyVpa()}>
                    {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                    {copied ? "Copied" : "Copy UPI ID"}
                  </Button>
                </div>
                <a
                  href={uri}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-fg sm:hidden"
                >
                  Pay with UPI app
                </a>
              </>
            ) : (
              <img
                src={upiQrUrl(payee.id)}
                alt={`${payee.name} UPI QR`}
                className="mx-auto max-h-64 max-w-full rounded-card border border-border object-contain"
              />
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <label className="chipless max-w-full">
          <PaperclipIcon />
          <span className="max-w-[9rem] truncate font-medium">
            {proof ? proof.name : "Attach payment proof (optional)"}
          </span>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.pdf"
            className="sr-only"
            onChange={(e) => setProof(e.target.files?.[0] ?? null)}
          />
        </label>
        {pendingProof !== null && (
          <Button
            type="button"
            variant="secondary"
            disabled={!proof || retryProof.isPending}
            onClick={() => retryProof.mutate()}
          >
            {retryProof.isPending ? "Uploading…" : "Attach proof to recorded payment"}
          </Button>
        )}
        <Button type="submit" disabled={settle.isPending || pendingProof !== null}>
          {pendingProof !== null ? "Payment recorded ✓" : settle.isPending ? "Recording…" : "Record payment"}
        </Button>
      </form>
    </Dialog>
  );
}

/** Step-through of every debt where you're the payer, recording one payee at a
 *  time. Debts are snapshotted once at mount so a live refetch can't shift the
 *  list and make the per-index flow record against the wrong payee. */
function SettleAllDialog({
  groupId,
  currency,
  debts,
  onClose,
}: {
  groupId: string;
  currency: string;
  debts: Debt[];
  onClose: () => void;
}) {
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  // Snapshot once at mount (lazy initializer) — never re-derived, so background
  // refetches during the flow can't shift this array. `me` is always loaded by
  // the time this mounts (RequireAuth gates on it).
  const [myDebts] = useState(() => (me ? debts.filter((d) => d.from === me.id) : []));
  const [index, setIndex] = useState(0);
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const current = myDebts[index];
  const payee = group?.members.find((m) => m.id === current?.to);
  const amount = amountOverride ?? (current ? (current.amount / 100).toFixed(2) : "");
  const amountMinor = Math.round((parseFloat(amount) || 0) * 100);
  const payeeVpa = payee?.upi_id && isValidVpa(payee.upi_id) ? payee.upi_id : null;
  const note = `Splitwise settle up: ${me?.name ?? ""} -> ${payee?.name ?? ""} . ${group?.name ?? ""}`.slice(0, 50);
  const showUpi = amountMinor > 0 && !!payee && (!!payeeVpa || payee.has_upi_qr);
  const uri = payeeVpa ? buildUpiUri({ vpa: payeeVpa, payeeName: payee?.name ?? "", amountMinor, note }) : "";
  const isRecorded = current ? recorded.has(current.to) : false;
  const isLast = index >= myDebts.length - 1;

  const close = () => {
    queryClient.invalidateQueries({ queryKey: ["debts", groupId] });
    queryClient.invalidateQueries({ queryKey: ["settlements", groupId] });
    onClose();
  };

  const record = useMutation({
    mutationFn: () =>
      createSettlement(groupId, {
        payer_id: me!.id,
        payee_id: current!.to,
        amount_minor: amountMinor,
        currency,
      }),
    onSuccess: () => {
      setRecorded((s) => new Set(s).add(current!.to));
      setError("");
      // Keep balances live during the flow; the snapshot above is unaffected.
      queryClient.invalidateQueries({ queryKey: ["debts", groupId] });
      queryClient.invalidateQueries({ queryKey: ["settlements", groupId] });
      if (isLast) close();
      else {
        setIndex(index + 1);
        setAmountOverride(null);
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function go(delta: number) {
    setIndex((i) => Math.min(Math.max(i + delta, 0), myDebts.length - 1));
    setAmountOverride(null);
    setError("");
  }

  async function copyVpa() {
    if (!payeeVpa) return;
    await navigator.clipboard.writeText(payeeVpa);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open onClose={close} title="Settle all">
      {!current ? (
        <p className="text-sm text-muted-fg">You don&apos;t owe anyone in this group.</p>
      ) : (
        <div key={index} className="settle-step grid gap-4">
          <div className="flex items-center justify-between text-sm text-muted-fg">
            <span>
              Step {index + 1} of {myDebts.length}
            </span>
            {isRecorded && <span className="text-success">Recorded</span>}
          </div>

          <div className="flex items-center gap-2.5">
            <Avatar name={payee?.name ?? ""} size={28} />
            <span className="text-sm">
              Pay <strong>{payee?.name ?? `User ${current.to}`}</strong>
            </span>
          </div>

          <label className="grid gap-1.5 text-sm">
            Amount ({currency})
            <Input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmountOverride(e.target.value)}
            />
          </label>

          {showUpi && payee && (
            <div className="grid gap-3 rounded-card border border-border bg-card p-4">
              <p className="text-sm font-medium">Pay via UPI</p>
              {payeeVpa ? (
                <>
                  <div className="hidden justify-items-center gap-3 sm:grid">
                    <UpiQr value={uri} caption={payee?.name} />
                    <Button variant="secondary" onClick={() => void copyVpa()}>
                      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                      {copied ? "Copied" : "Copy UPI ID"}
                    </Button>
                  </div>
                  <a
                    href={uri}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-fg sm:hidden"
                  >
                    Pay with UPI app
                  </a>
                </>
              ) : (
                <img
                  src={upiQrUrl(payee.id)}
                  alt={`${payee.name} UPI QR`}
                  className="mx-auto max-h-64 max-w-full rounded-card border border-border object-contain"
                />
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" disabled={index === 0} onClick={() => go(-1)} aria-label="Previous">
              ←
            </Button>
            <div className="flex gap-2">
              {isRecorded ? (
                <Button variant="secondary" onClick={() => (isLast ? close() : go(1))}>
                  Next
                </Button>
              ) : (
                <Button disabled={record.isPending || !(amountMinor > 0)} onClick={() => record.mutate()}>
                  {record.isPending ? "Recording…" : isLast ? "Record & finish" : "Record & next"}
                </Button>
              )}
              <Button variant="ghost" disabled={isLast} onClick={() => go(1)} aria-label="Next">
                →
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function BalancesTab({ groupId }: { groupId: string }) {
  const { data: group } = useGroup(groupId);
  const { data: debts, isPending, isError, refetch } = useGroupDebts(groupId);
  const { data: me } = useMe();
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleAllOpen, setSettleAllOpen] = useState(false);
  // Single debt (or none) is covered by the Settle-up dialog alone.
  const myDebtCount = me ? (debts ?? []).filter((d) => d.from === me.id).length : 0;

  return (
    <div>
      <div className="mb-3 flex justify-end gap-2">
        {myDebtCount > 1 && (
          <Button variant="secondary" disabled={isPending} onClick={() => setSettleAllOpen(true)}>
            Settle all
          </Button>
        )}
        <Button variant="secondary" onClick={() => setSettleOpen(true)}>
          Settle up
        </Button>
      </div>
      {isPending ? (
        <p className="text-muted-fg">Loading…</p>
      ) : isError ? (
        <ErrorState description="Couldn't load balances." action={() => void refetch()} />
      ) : !debts || debts.length === 0 ? (
        <EmptyState title="All settled up" description="Nobody owes anything in this group." />
      ) : (
        <ul className="grid gap-2">
          {debts.map((d, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-card border border-border bg-card px-4 py-3 text-sm"
            >
              <Avatar name={memberName(group?.members, d.from)} size={28} />
              <span>
                <strong>{memberName(group?.members, d.from)}</strong> owes{" "}
                <strong>{memberName(group?.members, d.to)}</strong>
              </span>
              <span className="ml-auto font-medium text-destructive">
                {formatMinor(d.amount, group?.currency ?? "INR")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {settleOpen && (
        <SettleUpDialog
          groupId={groupId}
          currency={group?.currency ?? "INR"}
          debts={debts ?? []}
          onClose={() => setSettleOpen(false)}
        />
      )}
      {settleAllOpen && (
        <SettleAllDialog
          groupId={groupId}
          currency={group?.currency ?? "INR"}
          debts={debts ?? []}
          onClose={() => setSettleAllOpen(false)}
        />
      )}
    </div>
  );
}

function SettlementRow({
  settlement,
  members,
  currency,
}: {
  settlement: Settlement;
  members: Member[] | undefined;
  currency: string;
}) {
  const [proofOpen, setProofOpen] = useState(false);
  return (
    <li className="flex items-center gap-2.5 rounded-card border border-border bg-card px-4 py-3 text-sm">
      <Avatar name={memberName(members, settlement.payer_id)} size={28} />
      <span className="min-w-0">
        <span className="block truncate">
          <strong>{memberName(members, settlement.payer_id)}</strong> paid{" "}
          <strong>{memberName(members, settlement.payee_id)}</strong>
        </span>
        <span className="text-xs text-muted-fg">{settlement.date}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <span className="font-medium tabular-nums">
          {formatMinor(settlement.amount_minor, currency)}
        </span>
        {settlement.proof_path && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="View payment proof"
            className="h-8 text-muted-fg"
            onClick={() => setProofOpen(true)}
          >
            <PaperclipIcon size={15} />
          </Button>
        )}
      </span>
      {proofOpen && (
        <Dialog open onClose={() => setProofOpen(false)} title="Payment proof">
          <Attachment
            url={settlementProofUrl(settlement.id)}
            path={settlement.proof_path}
            alt="Payment proof"
            linkLabel="Open proof (PDF)"
          />
        </Dialog>
      )}
    </li>
  );
}

function SettlementsTab({ groupId }: { groupId: string }) {
  const { data: group } = useGroup(groupId);
  const { data: settlements, isPending, isError, refetch } = useGroupSettlements(groupId);

  if (isPending) return <p className="text-muted-fg">Loading…</p>;
  if (isError)
    return <ErrorState description="Couldn't load settlements." action={() => void refetch()} />;
  if (!settlements || settlements.length === 0)
    return (
      <EmptyState
        title="No settlements yet"
        description="Payments recorded from the Balances tab show up here."
      />
    );

  return (
    <ul className="grid gap-2">
      {settlements.map((s) => (
        <SettlementRow
          key={s.id}
          settlement={s}
          members={group?.members}
          currency={group?.currency ?? "INR"}
        />
      ))}
    </ul>
  );
}

function AddMemberDialog({
  groupId,
  open,
  onClose,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const add = useMutation({
    mutationFn: (email: string) => addMember(groupId, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      setError("");
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    add.mutate((data.get("email") as string).trim());
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add member">
      <form onSubmit={onSubmit} className="grid gap-4">
        <label className="grid gap-1.5 text-sm">
          Email
          <Input name="email" type="email" required autoComplete="email" />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add"}
        </Button>
      </form>
    </Dialog>
  );
}

export default function GroupDetail() {
  const { id = "" } = useParams();
  const { data: me } = useMe();
  const { data: group, isPending, error, refetch } = useGroup(id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("expenses");
  const [addOpen, setAddOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileMember, setProfileMember] = useState<Member | null>(null);

  const del = useMutation({
    mutationFn: () => deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      navigate("/");
    },
  });

  const leave = useMutation({
    mutationFn: (userId: number) => removeMember(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group", id] });
      queryClient.invalidateQueries({ queryKey: ["expenses", id] });
      queryClient.invalidateQueries({ queryKey: ["debts", id] });
    },
  });

  async function copyInvite() {
    await navigator.clipboard.writeText(group?.invite_code ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isPending) return <p className="text-muted-fg">Loading…</p>;
  if (error || !group) {
    const notFound = error instanceof ApiError && error.status === 404;
    return notFound ? (
      <EmptyState title="Group not found" description="You may not be a member." />
    ) : (
      <ErrorState description="Couldn't load this group." action={() => void refetch()} />
    );
  }

  const myMembership = me ? group.members.find((m) => m.id === me.id) : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          <p className="text-sm text-muted-fg">{group.currency}</p>
        </div>
        <div className="flex flex-1 justify-end gap-2 max-sm:w-full">
          <Button onClick={() => setExpenseOpen(true)} className="max-sm:flex-1 max-sm:text-sm">
            Add expense
          </Button>
          <Button variant="secondary" onClick={() => setAddOpen(true)} aria-label="Add member" className="max-sm:h-10 max-sm:w-10 max-sm:px-0 max-sm:text-lg">
            <span className="max-sm:hidden">Add member</span>
            <PlusIcon size={18} className="hidden max-sm:block" />
          </Button>
          <Button variant="ghost" onClick={copyInvite} aria-label="Copy invite code" className="max-sm:h-10 max-sm:w-10 max-sm:px-0">
            {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
          </Button>
          {group.created_by === me?.id &&
            (confirmDelete ? (
              <span className="flex items-center gap-1">
                <Button variant="danger" disabled={del.isPending} onClick={() => del.mutate()}>
                  {del.isPending ? "…" : "Delete?"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete group"
                className="text-muted-fg hover:text-destructive max-sm:h-10 max-sm:w-10 max-sm:px-0"
              >
                <span className="max-sm:hidden text-sm">Delete group</span>
                <TrashIcon size={18} className="hidden max-sm:block" />
              </Button>
            ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {group.members.map((m) => (
          <span
            key={m.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm"
          >
            <button
              type="button"
              onClick={() => setProfileMember(m)}
              aria-label={`View ${m.name} payment details`}
              className="flex cursor-pointer items-center gap-1.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <Avatar name={m.name} size={24} />
              {m.name}
            </button>
            {m.role === "admin" && <span className="text-xs text-muted-fg">admin</span>}
            {myMembership?.role === "admin" && m.id !== me?.id && group.members.length > 1 && (
              <button
                aria-label={`Remove ${m.name}`}
                className="cursor-pointer text-xs text-muted-fg hover:text-destructive"
                onClick={() => leave.mutate(m.id)}
              >
                <XIcon size={12} />
              </button>
            )}
            {me && m.id === me.id && group.members.length > 1 && (
              <button
                aria-label="Leave group"
                className="cursor-pointer text-xs text-muted-fg hover:text-destructive"
                onClick={() => leave.mutate(m.id)}
              >
                leave
              </button>
            )}
          </span>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <Tabs
          pills
          tabs={[
            { id: "expenses", label: "Expenses" },
            { id: "balances", label: "Balances" },
            { id: "settlements", label: "Settlements" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-4">
        {tab === "expenses" ? (
          <ExpensesTab
            groupId={id}
            myId={me?.id ?? -1}
            myRole={myMembership?.role ?? "member"}
            onEdit={setEditing}
          />
        ) : tab === "balances" ? (
          <BalancesTab groupId={id} />
        ) : (
          <SettlementsTab groupId={id} />
        )}
      </div>

      {profileMember && (
        <MemberProfileDialog
          member={profileMember}
          groupName={group.name}
          onClose={() => setProfileMember(null)}
        />
      )}
      <AddMemberDialog groupId={id} open={addOpen} onClose={() => setAddOpen(false)} />
      {expenseOpen && <AddExpense groupId={id} onClose={() => setExpenseOpen(false)} />}
      {editing && <AddExpense groupId={id} expense={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
