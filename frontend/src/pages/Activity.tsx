import { Link } from "react-router";
import { useMyActivity, type ActivityItem } from "../api";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ActivityIcon, MessageIcon, PencilIcon, PlusIcon, SettleIcon, TrashIcon, UndoIcon, UserPlusIcon, UsersIcon, type Icon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { ListSkeleton } from "../components/Skeleton";
import { dayLabel, formatMinor, isoDay, relativeTime } from "../format";

/** verb → (sentence after the actor, badge icon, badge tint) */
const VERBS: Record<string, [string, Icon, string]> = {
  created_group: ["created the group", UsersIcon, "var(--accent)"],
  joined: ["joined", UserPlusIcon, "var(--accent)"],
  left: ["left", UsersIcon, "var(--muted-fg)"],
  removed: ["was removed", UsersIcon, "var(--muted-fg)"],
  expense_added: ["added", PlusIcon, "var(--primary)"],
  expense_updated: ["updated", PencilIcon, "var(--avatar-1)"],
  expense_deleted: ["deleted", TrashIcon, "var(--destructive)"],
  expense_restored: ["restored", UndoIcon, "var(--avatar-7)"],
  settlement_recorded: ["recorded a payment", SettleIcon, "var(--positive)"],
  recurring_cancelled: ["stopped a recurring expense", ActivityIcon, "var(--muted-fg)"],
  group_updated: ["updated group settings", PencilIcon, "var(--muted-fg)"],
  commented: ["commented on", MessageIcon, "var(--avatar-3)"],
};

function Row({ item, meId }: { item: ActivityItem; meId: number }) {
  const [phrase, Icon, tint] = VERBS[item.verb] ?? [item.verb.replace(/_/g, " "), ActivityIcon, "var(--muted-fg)"];
  const who = item.user_id === meId ? "You" : item.user_name;
  const d = item.detail;
  const isExpense = item.verb.startsWith("expense_") || item.verb === "commented";
  return (
    <li>
      <Link to={`/groups/${item.group_id}`} className="pressable flex gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-muted">
        <span className="relative shrink-0">
          <Avatar name={item.user_name} size={42} />
          <span
            className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-bg"
            style={{ background: tint }}
          >
            <Icon size={11} strokeWidth={3} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] leading-snug">
            <span className="font-semibold">{who}</span> {phrase}
            {isExpense && d && (
              <>
                {" "}
                <span className={`font-semibold ${item.verb === "expense_deleted" ? "line-through decoration-muted-fg/60" : ""}`}>“{d.description}”</span>
              </>
            )}
            {item.verb !== "created_group" && (
              <>
                {" "}in <span className="font-semibold">{item.group_name}</span>
              </>
            )}
            {item.verb === "created_group" && <> “{item.group_name}”</>}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-sm text-muted-fg">
            {d && item.verb !== "commented" && (
              <span className={`tabular font-medium ${item.verb === "settlement_recorded" ? "text-positive" : "text-fg/80"}`}>
                {item.verb === "settlement_recorded" ? `${d.description} · ` : ""}
                {formatMinor(d.amount, d.currency)}
              </span>
            )}
            <span>{relativeTime(item.created_at)}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function Activity() {
  const { data: me } = useMe();
  const { data: items, isPending, isError, refetch } = useMyActivity();

  const byDay = new Map<string, ActivityItem[]>();
  for (const it of items ?? []) {
    const day = isoDay(it.created_at);
    byDay.set(day, [...(byDay.get(day) ?? []), it]);
  }

  return (
    <div className="rise-in mx-auto max-w-2xl">
      <PageHeader title="Activity" subtitle="Everything that happened across your groups" />
      {isPending ? (
        <ListSkeleton rows={6} tile="rounded-full" />
      ) : isError ? (
        <ErrorState description="Couldn't load activity." action={() => void refetch()} />
      ) : !items.length ? (
        <EmptyState icon={ActivityIcon} title="Nothing yet" description="Expenses, payments and new members in your groups show up here." />
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <section key={day} className="mb-3">
            <h2 className="px-1 py-2 text-xs font-semibold uppercase tracking-wide text-muted-fg">{dayLabel(day)}</h2>
            <ul className="-mx-3 grid grid-cols-[minmax(0,1fr)]">
              {list.map((it) => (
                <Row key={it.id} item={it} meId={me?.id ?? -1} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
