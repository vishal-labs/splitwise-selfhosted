import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, createGroup, getGroupDebts, useGroups, type Group } from "../api";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { formatMinor } from "../format";

/** Your net balance in one group: sum of debts where you're the payee minus payer. */
function useNetBalance(group: Group, myId: number | undefined) {
  return useQuery({
    queryKey: ["debts", group.id],
    queryFn: () => api<{ from: number; to: number; amount: number }[]>(`/groups/${group.id}/debts`),
    enabled: myId !== undefined,
    select: (debts) =>
      debts.reduce(
        (net, d) => net + (d.to === myId ? d.amount : d.from === myId ? -d.amount : 0),
        0,
      ),
  });
}

/** Aggregate "owed to you" / "you owe" across all groups. Shares the ["debts", id] cache with GroupCard. */
function useNetTotals(groups: Group[] | undefined, myId: number) {
  const queries = useQueries({
    queries: (groups ?? []).map((g) => ({
      queryKey: ["debts", g.id],
      queryFn: () => getGroupDebts(g.id),
      enabled: myId > 0,
    })),
  });
  // ponytail: sums assume one currency across groups; split per-currency if that ever varies
  return queries.reduce(
    (acc, q) => {
      const net = (q.data ?? []).reduce(
        (n, d) => n + (d.to === myId ? d.amount : d.from === myId ? -d.amount : 0),
        0,
      );
      return { owed: acc.owed + Math.max(net, 0), owe: acc.owe + Math.max(-net, 0) };
    },
    { owed: 0, owe: 0 },
  );
}

function GroupCard({ group, myId }: { group: Group; myId: number }) {
  const { data: net } = useNetBalance(group, myId);
  return (
    <Link
      to={`/groups/${group.id}`}
      className="flex items-center gap-3 rounded-card border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Avatar name={group.name} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{group.name}</p>
        <p className="text-sm text-muted-fg">
          {group.member_count} {group.member_count === 1 ? "member" : "members"}
        </p>
      </div>
      {net !== undefined && net !== 0 && (
        <span className={`text-sm font-medium ${net > 0 ? "text-success" : "text-destructive"}`}>
          {net > 0 ? "+" : "−"}
          {formatMinor(Math.abs(net), group.currency)}
        </span>
      )}
    </Link>
  );
}

export const joinGroup = (code: string) =>
  api<Group>(`/groups/join/${encodeURIComponent(code)}`, { method: "POST" });

export default function Dashboard() {
  const { data: me } = useMe();
  const { data: groups, isPending } = useGroups();
  const { owed, owe } = useNetTotals(groups, me?.id ?? 0);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");

  const create = useMutation({
    mutationFn: (body: { name: string; currency: string }) => createGroup(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setOpen(false);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  const join = useMutation({
    mutationFn: (code: string) => joinGroup(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setJoinOpen(false);
    },
    onError: (e) => setJoinError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    create.mutate({
      name: (data.get("name") as string).trim(),
      currency: ((data.get("currency") as string) || "USD").trim().toUpperCase(),
    });
  }

  function onJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setJoinError("");
    const data = new FormData(e.currentTarget);
    join.mutate(((data.get("code") as string) || "").trim());
  }

  if (isPending) return <p className="text-muted-fg">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Groups</h1>
        <div className="flex gap-2">
          <Button onClick={() => setJoinOpen(true)} variant="ghost">
            Join
          </Button>
          <Button onClick={() => setOpen(true)}>New group</Button>
        </div>
      </div>

      {(owed > 0 || owe > 0) && (
        <p className="mt-2 text-sm font-medium">
          {owed > 0 && (
            <span className="text-success">
              You're owed {formatMinor(owed, groups?.[0]?.currency ?? "USD")}
            </span>
          )}
          {owed > 0 && owe > 0 && <span className="text-muted-fg"> · </span>}
          {owe > 0 && (
            <span className="text-destructive">
              You owe {formatMinor(owe, groups?.[0]?.currency ?? "USD")}
            </span>
          )}
        </p>
      )}

      {groups && groups.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} myId={me!.id} />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            title="No groups yet"
            description="Create a group to start splitting expenses with friends."
            action={<Button onClick={() => setOpen(true)}>Create your first group</Button>}
          />
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Create group">
        <form onSubmit={onSubmit} className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            Name
            <Input name="name" required maxLength={255} placeholder="Trip to Goa" />
          </label>
          <label className="grid gap-1.5 text-sm">
            Currency
            <Input name="currency" defaultValue="USD" required pattern="[A-Za-z]{3}" title="3-letter currency code" />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </form>
      </Dialog>

      <Dialog open={joinOpen} onClose={() => setJoinOpen(false)} title="Join group">
        <form onSubmit={onJoin} className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            Invite code
            <Input name="code" required maxLength={16} placeholder="e.g. 3fa1b2c4" />
          </label>
          {joinError && (
            <p role="alert" className="text-sm text-destructive">
              {joinError}
            </p>
          )}
          <Button type="submit" disabled={join.isPending}>
            {join.isPending ? "Joining…" : "Join"}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
