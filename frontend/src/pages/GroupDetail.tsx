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
  upiQrUrl,
  useGroup,
  useGroupDebts,
  useGroupExpenses,
  type Comment,
  type Debt,
  type Expense,
  type Member,
} from "../api";
import { QRCodeSVG } from "qrcode.react";
import { buildUpiUri, isValidVpa } from "../upi";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { CheckIcon, CopyIcon, PencilIcon, PlusIcon, RepeatIcon, TrashIcon, XIcon } from "../components/icons";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
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

        <Receipt expenseId={expense.id} />

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

/** Receipt image; 404 (no receipt) renders nothing. */
function Receipt({ expenseId }: { expenseId: number }) {
  const [error, setError] = useState(false);
  if (error) return null;
  return (
    <div className="grid gap-1 text-sm">
      <h3 className="font-medium">Receipt</h3>
      {/* fetch with cookie session via credentials: include */}
      <img
        src={`/api/expenses/${expenseId}/receipt`}
        alt="Receipt"
        className="max-h-72 rounded-card border border-border object-contain"
        onError={() => setError(true)}
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
  const { data: expenses, isPending } = useGroupExpenses(groupId);
  const members = group?.members;

  if (isPending) return <p className="text-muted-fg">Loading…</p>;
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
  const [copied, setCopied] = useState(false);
  const vpa = member.upi_id && isValidVpa(member.upi_id) ? member.upi_id : null;

  async function copy() {
    if (!vpa) return;
    await navigator.clipboard.writeText(vpa);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            <div className="flex justify-center">
              <QRCodeSVG
                value={buildUpiUri({ vpa, payeeName: member.name, note: `Splitwise: ${groupName}` })}
                size={200}
                className="h-auto max-w-full"
              />
            </div>
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
  initial,
  onClose,
}: {
  groupId: string;
  currency: string;
  initial: Debt | undefined;
  onClose: () => void;
}) {
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [payeeId, setPayeeId] = useState<number | null>(null);
  const [amount, setAmount] = useState(initial ? (initial.amount / 100).toFixed(2) : "");
  const [copied, setCopied] = useState(false);

  const settle = useMutation({
    mutationFn: (body: { payer_id: number; payee_id: number; amount_minor: number }) =>
      createSettlement(groupId, { ...body, currency }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debts", groupId] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  const defaultPayeeId =
    initial && initial.from === me?.id ? initial.to : group?.members.find((m) => m.id !== me?.id)?.id;
  const selectedPayeeId = payeeId ?? defaultPayeeId ?? null;
  const payee = group?.members.find((m) => m.id === selectedPayeeId);
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
              onChange={(e) => setPayeeId(Number(e.target.value))}
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
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {showUpi && payee && (
          <div className="grid gap-3 rounded-card border border-border bg-card p-4">
            <p className="text-sm font-medium">Pay via UPI</p>
            {payeeVpa ? (
              <>
                <div className="hidden justify-items-center gap-3 sm:grid">
                  <QRCodeSVG value={uri} size={200} className="h-auto max-w-full" />
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
        <Button type="submit" disabled={settle.isPending}>
          {settle.isPending ? "Recording…" : "Record payment"}
        </Button>
      </form>
    </Dialog>
  );
}

function BalancesTab({ groupId }: { groupId: string }) {
  const { data: group } = useGroup(groupId);
  const { data: debts, isPending } = useGroupDebts(groupId);
  const [settleOpen, setSettleOpen] = useState(false);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" onClick={() => setSettleOpen(true)}>
          Settle up
        </Button>
      </div>
      {isPending ? (
        <p className="text-muted-fg">Loading…</p>
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
          initial={debts?.[0]}
          onClose={() => setSettleOpen(false)}
        />
      )}
    </div>
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
  const { data: group, isPending, error } = useGroup(id);
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
  if (error || !group)
    return <EmptyState title="Group not found" description="You may not be a member." />;

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
        ) : (
          <BalancesTab groupId={id} />
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
