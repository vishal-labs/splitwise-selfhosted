import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ApiError,
  useGroup,
  useGroupDebts,
  useGroupExpenses,
  useGroupSettlements,
  type Expense,
  type Member,
  type Settlement,
} from "../api";
import { useAddExpense, useMe } from "../App";
import { AvatarStack, GroupAvatar } from "../components/Avatar";
import { buttonClass } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { BellIcon, ChartIcon, ChevronLeftIcon, PlusIcon, SettleIcon, ShareIcon, SlidersIcon } from "../components/icons";
import { Block, ListSkeleton } from "../components/Skeleton";
import { Tabs } from "../components/Tabs";
import { formatMinor } from "../format";
import AddExpense from "./AddExpense";
import { Balances, memberNets, useRemind } from "./group/Balances";
import { ExpenseDetail } from "./group/ExpenseDetail";
import { Feed, memberName } from "./group/Feed";
import { GroupSettings } from "./group/GroupSettings";
import { MemberProfileDialog, PaymentDetail, SettleAllDialog, SettleUpDialog } from "./group/Settle";
import { shareText } from "../balance";

const chip =
  "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted";

export default function GroupDetail() {
  const { id = "" } = useParams();
  const { data: me } = useMe();
  const openAdd = useAddExpense();
  const group = useGroup(id);
  const expenses = useGroupExpenses(id);
  const debts = useGroupDebts(id);
  const settlements = useGroupSettlements(id);
  const [tab, setTab] = useState<"expenses" | "balances">("expenses");
  const [dialog, setDialog] = useState<
    | { kind: "settings" | "settle-all" }
    | { kind: "settle"; to?: number }
    | { kind: "expense"; expense: Expense }
    | { kind: "edit"; expense: Expense }
    | { kind: "payment"; settlement: Settlement }
    | { kind: "member"; member: Member }
    | null
  >(null);
  const remind = useRemind(me!, group.data?.name ?? "");

  if (group.isPending)
    return (
      <div className="grid gap-4">
        <Block className="h-8 w-24" />
        <div className="flex items-center gap-3">
          <Block className="h-14 w-14 rounded-2xl" />
          <Block className="h-7 w-48" />
        </div>
        <ListSkeleton />
      </div>
    );
  if (group.error || !group.data) {
    const notFound = group.error instanceof ApiError && group.error.status === 404;
    return notFound ? (
      <EmptyState title="Group not found" description="It may have been deleted, or you're no longer a member." action={<Link to="/" className={buttonClass("secondary")}>Back to groups</Link>} />
    ) : (
      <ErrorState description="Couldn't load this group." action={() => void group.refetch()} />
    );
  }

  const g = group.data;
  const meId = me!.id;
  const myRole = g.members.find((m) => m.id === meId)?.role ?? "member";
  const debtList = debts.data ?? [];
  const myNet = memberNets(debtList).get(meId) ?? 0;
  const owedToMe = debtList.filter((d) => d.to === meId);
  const iOwe = debtList.filter((d) => d.from === meId);
  const myLines = [...owedToMe.map((d) => ({ d, mine: false })), ...iOwe.map((d) => ({ d, mine: true }))];

  const summary = (
    <div className="mt-4">
      {debts.isPending ? (
        <Block className="h-6 w-56" />
      ) : myNet === 0 ? (
        <p className="text-muted-fg">{debtList.length ? "You're settled up in this group." : "Everyone is settled up."}</p>
      ) : (
        <>
          <p className={`text-lg font-semibold ${myNet > 0 ? "text-positive" : "text-negative"}`}>
            {myNet > 0 ? "You are owed " : "You owe "}
            <span className="tabular">{formatMinor(Math.abs(myNet), g.currency)}</span>
          </p>
          <ul className="mt-1 grid gap-0.5 text-sm text-muted-fg">
            {myLines.slice(0, 3).map(({ d, mine }) => (
              <li key={`${d.from}-${d.to}`}>
                {mine ? (
                  <>
                    You owe {memberName(g.members, d.to)} <span className="tabular font-medium text-negative">{formatMinor(d.amount, g.currency)}</span>
                  </>
                ) : (
                  <>
                    {memberName(g.members, d.from)} owes you <span className="tabular font-medium text-positive">{formatMinor(d.amount, g.currency)}</span>
                  </>
                )}
              </li>
            ))}
            {myLines.length > 3 && <li>and {myLines.length - 3} more…</li>}
          </ul>
        </>
      )}
    </div>
  );

  const balances =
    debts.isPending ? (
      <ListSkeleton rows={3} tile="rounded-full" />
    ) : debts.isError ? (
      <ErrorState description="Couldn't load balances." action={() => void debts.refetch()} />
    ) : (
      <Balances group={g} me={me!} debts={debtList} onSettle={(to) => setDialog({ kind: "settle", to })} onMember={(member) => setDialog({ kind: "member", member })} />
    );

  const feed =
    expenses.isPending || settlements.isPending ? (
      <ListSkeleton rows={6} />
    ) : expenses.isError ? (
      <ErrorState description="Couldn't load expenses." action={() => void expenses.refetch()} />
    ) : (
      <Feed
        expenses={expenses.data}
        settlements={settlements.data ?? []}
        members={g.members}
        meId={meId}
        currency={g.currency}
        onOpenExpense={(expense) => setDialog({ kind: "expense", expense })}
        onOpenPayment={(settlement) => setDialog({ kind: "payment", settlement })}
        onAdd={() => openAdd(id)}
      />
    );

  return (
    <div className="rise-in">
      <div className="mb-3 flex items-center justify-between md:mb-4">
        <Link to="/" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-full pl-1.5 pr-3 text-sm font-medium text-muted-fg hover:bg-muted hover:text-fg">
          <ChevronLeftIcon size={20} /> Groups
        </Link>
        <button type="button" aria-label="Group settings" onClick={() => setDialog({ kind: "settings" })} className={`${buttonClass("ghost", "icon")} text-muted-fg`}>
          <SlidersIcon size={20} />
        </button>
      </div>

      <header>
        <div className="flex items-center gap-3.5">
          <GroupAvatar name={g.name} size={60} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">{g.name}</h1>
            <button type="button" onClick={() => setDialog({ kind: "settings" })} className="mt-1 flex cursor-pointer items-center gap-2 text-sm text-muted-fg hover:text-fg">
              <AvatarStack names={g.members.map((m) => m.name)} size={22} />
              {g.members.length} {g.members.length === 1 ? "member" : "members"} · {g.currency}
            </button>
          </div>
        </div>
        {summary}
      </header>

      <div className="scroll-x -mx-4 mt-5 gap-2 px-4 sm:mx-0 sm:px-0">
        <button type="button" className={`${chip} border-transparent bg-hero text-hero-fg hover:bg-hero hover:brightness-110`} onClick={() => setDialog({ kind: "settle" })}>
          <SettleIcon size={16} /> Settle up
        </button>
        {iOwe.length > 1 && (
          <button type="button" className={chip} onClick={() => setDialog({ kind: "settle-all" })}>
            Settle all
          </button>
        )}
        {owedToMe.length > 0 && (
          <button
            type="button"
            className={chip}
            onClick={() => {
              const top = [...owedToMe].sort((a, b) => b.amount - a.amount)[0];
              const who = g.members.find((m) => m.id === top.from);
              if (who) void remind(who, top.amount, g.currency);
            }}
          >
            <BellIcon size={16} /> Remind
          </button>
        )}
        <Link to={`/groups/${g.id}/totals`} className={chip}>
          <ChartIcon size={16} /> Totals
        </Link>
        <button type="button" className={chip} onClick={() => void shareText(`Join “${g.name}” on Splitwise: ${location.origin}/join/${g.invite_code}`)}>
          <ShareIcon size={16} /> Invite
        </button>
        <button type="button" className={`${chip} max-md:hidden`} onClick={() => openAdd(id)}>
          <PlusIcon size={16} strokeWidth={2.5} /> Add expense
        </button>
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <div className="mb-3 lg:hidden">
            <Tabs
              full
              label="Group view"
              tabs={[
                { id: "expenses", label: "Expenses" },
                { id: "balances", label: "Balances" },
              ]}
              value={tab}
              onChange={(t) => setTab(t as "expenses" | "balances")}
            />
          </div>
          <div className="lg:hidden">{tab === "expenses" ? feed : balances}</div>
          <div className="max-lg:hidden">{feed}</div>
        </div>
        <aside className="max-lg:hidden lg:sticky lg:top-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-fg">Balances</h2>
          {balances}
        </aside>
      </div>

      {dialog?.kind === "settings" && <GroupSettings group={g} me={me!} onClose={() => setDialog(null)} />}
      {dialog?.kind === "settle" && <SettleUpDialog group={g} me={me!} debts={debtList} initialTo={dialog.to} onClose={() => setDialog(null)} />}
      {dialog?.kind === "settle-all" && <SettleAllDialog group={g} me={me!} debts={debtList} onClose={() => setDialog(null)} />}
      {dialog?.kind === "expense" && (
        <ExpenseDetail
          expense={dialog.expense}
          members={g.members}
          meId={meId}
          groupCurrency={g.currency}
          canEdit={dialog.expense.created_by === meId || myRole === "admin"}
          onEdit={() => setDialog({ kind: "edit", expense: dialog.expense })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "edit" && <AddExpense groupId={id} expense={dialog.expense} onClose={() => setDialog(null)} />}
      {dialog?.kind === "payment" && (
        <PaymentDetail settlement={dialog.settlement} members={g.members} meId={meId} currency={g.currency} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "member" && <MemberProfileDialog member={dialog.member} me={me!} groupName={g.name} onClose={() => setDialog(null)} />}
    </div>
  );
}
