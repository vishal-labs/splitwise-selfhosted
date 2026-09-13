import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router";
import {
  addMember,
  createSettlement,
  deleteExpense,
  removeMember,
  useGroup,
  useGroupDebts,
  useGroupExpenses,
  type Debt,
  type Expense,
  type Member,
} from "../api";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
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
}: {
  expense: Expense;
  members: Member[];
  myId: number;
  myRole: string;
}) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const groupId = expense.group_id;

  const del = useMutation({
    mutationFn: () => deleteExpense(expense.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", groupId] });
      queryClient.invalidateQueries({ queryKey: ["debts", groupId] });
    },
  });

  const canDelete = expense.created_by === myId || myRole === "admin";
  const myShare = expense.splits.find((s) => s.user_id === myId)?.amount_minor ?? 0;
  const total = expense.converted_amount_minor ?? expense.amount_minor;

  return (
    <li className="flex items-center gap-3 px-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{expense.description}</p>
        <p className="text-sm text-muted-fg">
          {memberName(members, expense.payer_id)} paid · your share{" "}
          {formatMinor(myShare, expense.currency)}
        </p>
      </div>
      <span className="font-medium">{formatMinor(total, expense.currency)}</span>
      {canDelete &&
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
            aria-label={`Delete ${expense.description}`}
            className="h-8 px-2 text-sm text-muted-fg"
            onClick={() => setConfirm(true)}
          >
            ✕
          </Button>
        ))}
    </li>
  );
}

function ExpensesTab({
  groupId,
  myId,
  myRole,
}: {
  groupId: string;
  myId: number;
  myRole: string;
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
        <section key={date}>
          <h3 className="text-sm font-medium text-muted-fg">{date}</h3>
          <ul className="divide-y divide-border">
            {list.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                members={members ?? []}
                myId={myId}
                myRole={myRole}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
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
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const settle = useMutation({
    mutationFn: (body: { payer_id: number; payee_id: number; amount_minor: number }) =>
      createSettlement(groupId, { ...body, currency }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debts", groupId] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const amountMinor = Math.round((parseFloat(data.get("amount") as string) || 0) * 100);
    if (!(amountMinor > 0)) {
      setError("Amount must be greater than zero");
      return;
    }
    settle.mutate({
      payer_id: Number(data.get("payer_id")),
      payee_id: Number(data.get("payee_id")),
      amount_minor: amountMinor,
    });
  }

  return (
    <Dialog open onClose={onClose} title="Settle up">
      <form onSubmit={onSubmit} className="grid gap-4">
        <label className="grid gap-1.5 text-sm">
          Payer
          <select
            name="payer_id"
            defaultValue={initial?.from ?? group?.members[0]?.id}
            className="h-10 rounded-lg border border-border bg-card px-3 focus-visible:outline-2 focus-visible:outline-ring"
            required
          >
            {group?.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Payee
          <select
            name="payee_id"
            defaultValue={initial?.to ?? group?.members[0]?.id}
            className="h-10 rounded-lg border border-border bg-card px-3 focus-visible:outline-2 focus-visible:outline-ring"
            required
          >
            {group?.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Amount ({currency})
          <Input name="amount" type="number" step="0.01" min="0.01" required defaultValue={initial ? (initial.amount / 100).toFixed(2) : undefined} />
        </label>
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
                {formatMinor(d.amount, group?.currency ?? "USD")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {settleOpen && (
        <SettleUpDialog
          groupId={groupId}
          currency={group?.currency ?? "USD"}
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
  const [tab, setTab] = useState("expenses");
  const [addOpen, setAddOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const leave = useMutation({
    mutationFn: (userId: number) => removeMember(id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });

  if (isPending) return <p className="text-muted-fg">Loading…</p>;
  if (error || !group)
    return <EmptyState title="Group not found" description="You may not be a member." />;

  const myMembership = me ? group.members.find((m) => m.id === me.id) : undefined;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          <p className="text-sm text-muted-fg">{group.currency}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setExpenseOpen(true)}>Add expense</Button>
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            Add member
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {group.members.map((m) => (
          <span
            key={m.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm"
          >
            <Avatar name={m.name} size={24} />
            {m.name}
            {m.role === "admin" && <span className="text-xs text-muted-fg">admin</span>}
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

      <div className="mt-6">
        <Tabs
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
          <ExpensesTab groupId={id} myId={me?.id ?? -1} myRole={myMembership?.role ?? "member"} />
        ) : (
          <BalancesTab groupId={id} />
        )}
      </div>

      <AddMemberDialog groupId={id} open={addOpen} onClose={() => setAddOpen(false)} />
      {expenseOpen && <AddExpense groupId={id} onClose={() => setExpenseOpen(false)} />}
    </div>
  );
}
