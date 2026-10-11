import { useState } from "react";
import { Link } from "react-router";
import { useFriends, type Friend } from "../api";
import { useMe } from "../App";
import { overallTotals, reminderText, shareText } from "../balance";
import { Avatar, GroupAvatar } from "../components/Avatar";
import { BalanceHero } from "../components/BalanceHero";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { BellIcon, ChevronRightIcon, SearchIcon, UsersIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { ListSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import UpiQr from "../components/UpiQr";
import { firstName, formatMinor } from "../format";
import { buildUpiUri, isValidVpa } from "../upi";

function Status({ friend }: { friend: Friend }) {
  if (friend.balances.length === 0) return <span className="text-sm text-muted-fg">settled up</span>;
  return (
    <span className="grid justify-items-end">
      {friend.balances.map((b) => (
        <span key={b.currency} className={`text-right leading-tight ${b.amount > 0 ? "text-positive" : "text-negative"}`}>
          <span className="block text-xs">{b.amount > 0 ? "owes you" : "you owe"}</span>
          <span className="tabular block font-semibold">{formatMinor(Math.abs(b.amount), b.currency)}</span>
        </span>
      ))}
    </span>
  );
}

function FriendSheet({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const { data: me } = useMe();
  const toast = useToast();
  const vpa = friend.upi_id && isValidVpa(friend.upi_id) ? friend.upi_id : null;
  // what you owe them in INR, for a one-tap UPI payment
  const oweInr = -(friend.balances.find((b) => b.currency === "INR" && b.amount < 0)?.amount ?? 0);
  const owedTo = friend.balances.filter((b) => b.amount > 0);

  async function remind() {
    if (!me) return;
    const text = owedTo
      .map((b) => reminderText(me, friend, b.amount, b.currency, owedTo.length === 1 && friend.groups.length === 1 ? friend.groups[0].group_name : undefined))
      .join("\n\n");
    const how = await shareText(text);
    if (how !== "cancelled") toast(`Reminder ready for ${firstName(friend.name)}`);
  }

  return (
    <Dialog open onClose={onClose} title={friend.name}>
      <div className="grid gap-5 pt-1">
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar name={friend.name} size={64} pending={friend.pending} />
          <div>
            <p className="text-lg font-bold">{friend.name}</p>
            <p className="text-sm text-muted-fg">{friend.email}</p>
            {friend.pending && <p className="mt-1 text-xs font-semibold text-primary-soft-fg">Invited — hasn't signed up yet</p>}
          </div>
          {friend.balances.length === 0 ? (
            <p className="mt-1 rounded-full bg-muted px-4 py-1.5 text-sm text-muted-fg">You're all settled up</p>
          ) : (
            friend.balances.map((b) => (
              <p key={b.currency} className={`text-2xl font-bold tracking-tight ${b.amount > 0 ? "text-positive" : "text-negative"}`}>
                <span className="block text-sm font-medium">{b.amount > 0 ? `${firstName(friend.name)} owes you` : `You owe ${firstName(friend.name)}`}</span>
                <span className="tabular">{formatMinor(Math.abs(b.amount), b.currency)}</span>
              </p>
            ))
          )}
        </div>

        {(owedTo.length > 0 || (oweInr > 0 && vpa)) && (
          <div className="grid gap-2">
            {owedTo.length > 0 && (
              <Button variant="soft" size="lg" onClick={() => void remind()}>
                <BellIcon size={18} /> Send a reminder
              </Button>
            )}
            {oweInr > 0 && vpa && (
              <>
                <a
                  href={buildUpiUri({ vpa, payeeName: friend.name, amountMinor: oweInr, note: "Splitwise settle up" })}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-hero font-semibold text-hero-fg sm:hidden"
                >
                  Pay {formatMinor(oweInr, "INR")} via UPI
                </a>
                <div className="hidden sm:block">
                  <UpiQr value={buildUpiUri({ vpa, payeeName: friend.name, amountMinor: oweInr, note: "Splitwise settle up" })} caption={`Scan to pay ${friend.name}`} />
                </div>
                <p className="text-center text-xs text-muted-fg">After paying, record it in the group with “Settle up”.</p>
              </>
            )}
          </div>
        )}

        {friend.groups.length > 0 && (
          <section className="grid gap-2">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-fg">By group</h3>
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {friend.groups.map((g) => (
                <li key={g.group_id}>
                  <Link to={`/groups/${g.group_id}`} onClick={onClose} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted">
                    <GroupAvatar name={g.group_name} size={36} />
                    <span className="min-w-0 flex-1 truncate font-medium">{g.group_name}</span>
                    <span className={`tabular text-sm font-semibold ${g.amount > 0 ? "text-positive" : "text-negative"}`}>
                      {g.amount > 0 ? "+" : "−"}
                      {formatMinor(Math.abs(g.amount), g.currency)}
                    </span>
                    <ChevronRightIcon size={16} className="text-muted-fg" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}

export default function Friends() {
  const { data: friends, isPending, isError, refetch } = useFriends();
  const [open, setOpen] = useState<Friend | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "owe" | "owed">("all");
  const { owed, owe } = overallTotals(friends ?? []);

  const shown = (friends ?? []).filter((f) => {
    if (query && !`${f.name} ${f.email}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "owed") return f.balances.some((b) => b.amount > 0);
    if (filter === "owe") return f.balances.some((b) => b.amount < 0);
    return true;
  });

  return (
    <div className="rise-in">
      <PageHeader title="Friends" subtitle="Everyone you share a group with" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="lg:order-2 lg:sticky lg:top-8">
          <BalanceHero owed={owed} owe={owe} loading={isPending} />
        </div>
        <section className="lg:order-1">
          {isPending ? (
            <ListSkeleton rows={5} tile="rounded-full" />
          ) : isError ? (
            <ErrorState description="Couldn't load your friends." action={() => void refetch()} />
          ) : friends.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No friends yet" description="People you share a group with show up here, with your balance across every group." />
          ) : (
            <>
              <div className="mb-3 grid gap-2">
                {friends.length > 6 && (
                  <label className="relative block">
                    <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-fg" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search friends"
                      aria-label="Search friends"
                      className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-4 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                    />
                  </label>
                )}
                <div className="flex gap-1.5">
                  {(
                    [
                      ["all", "All"],
                      ["owed", "Owe you"],
                      ["owe", "You owe"],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className="chipless">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-fg">Nobody here.</p>
              ) : (
                <ul className="-mx-3 grid grid-cols-[minmax(0,1fr)] gap-0.5">
                  {shown.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(f)}
                        className="pressable flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted"
                      >
                        <Avatar name={f.name} size={46} pending={f.pending} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{f.name}</span>
                          <span className="block truncate text-sm text-muted-fg">
                            {f.pending ? "Invited" : f.groups.length ? f.groups.map((g) => g.group_name).join(", ") : f.email}
                          </span>
                        </span>
                        <Status friend={f} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
      {open && <FriendSheet friend={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
