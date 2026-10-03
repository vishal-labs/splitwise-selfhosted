import { useState } from "react";
import { useActivity, useGroups } from "../api";
import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";

/** "expense_added" → "added an expense"; unknown verbs fall back to the raw word. */
const VERB_PHRASES: Record<string, string> = {
  created_group: "created the group",
  joined: "joined the group",
  expense_added: "added an expense",
  expense_deleted: "deleted an expense",
  settlement_recorded: "recorded a settlement",
  commented: "commented",
};

function relativeTime(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (seconds >= secs) return rtf.format(-Math.floor(seconds / secs), unit);
  }
  return "just now";
}

export default function Activity() {
  const { data: groups, isPending: groupsPending, isError: groupsError, refetch: refetchGroups } = useGroups();
  const [groupId, setGroupId] = useState<number | "">("");

  const group = groups?.find((g) => g.id === groupId) ?? groups?.[0];
  const { data: items, isPending, isError, refetch } = useActivity(group?.id ?? 0);

  if (groupsPending) return <p className="text-muted-fg">Loading…</p>;
  if (groupsError)
    return (
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <div className="mt-4">
          <ErrorState description="Couldn't load your groups." action={() => void refetchGroups()} />
        </div>
      </div>
    );
  if (!groups?.length)
    return <EmptyState title="No groups yet" description="Create a group to see its activity." />;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Activity</h1>

      <select
        aria-label="Group"
        className="mt-4 h-10 rounded-lg border border-border bg-card px-3 text-sm"
        value={group?.id ?? ""}
        onChange={(e) => setGroupId(Number(e.target.value))}
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {isPending ? (
        <p className="mt-6 text-muted-fg">Loading…</p>
      ) : isError ? (
        <div className="mt-6">
          <ErrorState description="Couldn't load activity." action={() => void refetch()} />
        </div>
      ) : !items?.length ? (
        <div className="mt-6">
          <EmptyState title="No activity" description="Nothing has happened in this group yet." />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {items.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <Avatar name={a.user_name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{a.user_name}</span>{" "}
                  {VERB_PHRASES[a.verb] ?? a.verb.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-muted-fg">{relativeTime(a.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
