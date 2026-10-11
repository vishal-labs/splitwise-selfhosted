import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { createGroup, joinGroup, useFriends, useGroups, type Group } from "../api";
import { useMe } from "../App";
import { groupNets, overallTotals } from "../balance";
import { GroupAvatar } from "../components/Avatar";
import { BalanceHero } from "../components/BalanceHero";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ChevronRightIcon, GroupsIcon, LinkIcon, PlusIcon, QrIcon } from "../components/icons";
import { Field, FormError, Input, inputClass } from "../components/Input";
import { PageHeader } from "../components/PageHeader";
import { PaymentForm } from "../components/PaymentForm";
import { ListSkeleton } from "../components/Skeleton";
import { CURRENCIES, firstName, formatMinor } from "../format";

function GroupRow({ group, net, loading }: { group: Group; net: number | undefined; loading: boolean }) {
  return (
    <li>
      <Link
        to={`/groups/${group.id}`}
        className="pressable flex items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors hover:bg-muted"
      >
        <GroupAvatar name={group.name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{group.name}</p>
          <p className="text-sm text-muted-fg">
            {group.member_count} {group.member_count === 1 ? "member" : "members"} · {group.currency}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {loading ? (
            <span className="skeleton block h-8 w-20" />
          ) : net ? (
            <>
              <p className={`text-xs font-medium ${net > 0 ? "text-positive" : "text-negative"}`}>
                {net > 0 ? "you are owed" : "you owe"}
              </p>
              <p className={`tabular font-semibold ${net > 0 ? "text-positive" : "text-negative"}`}>
                {formatMinor(Math.abs(net), group.currency)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-fg">settled up</p>
          )}
        </div>
        <ChevronRightIcon size={18} className="shrink-0 text-muted-fg/60 max-sm:hidden" />
      </Link>
    </li>
  );
}

export default function Dashboard() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const { data: groups, isPending, isError, refetch } = useGroups();
  const friends = useFriends();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<"create" | "join" | "upi" | null>(null);
  const [error, setError] = useState("");

  const nets = friends.data ? groupNets(friends.data) : new Map<number, number>();
  const { owed, owe } = overallTotals(friends.data ?? []);
  const close = () => {
    setOpen(null);
    setError("");
  };

  const create = useMutation({
    mutationFn: (body: { name: string; currency: string }) => createGroup(body),
    onSuccess: (g) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      close();
      navigate(`/groups/${g.id}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  const join = useMutation({
    mutationFn: (code: string) => joinGroup(code),
    onSuccess: (g) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      close();
      navigate(`/groups/${g.id}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    create.mutate({
      name: (data.get("name") as string).trim(),
      currency: (data.get("currency") as string) || "INR",
    });
  }

  function onJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const raw = ((new FormData(e.currentTarget).get("code") as string) || "").trim();
    // accept a pasted invite link as well as the bare code
    join.mutate(raw.split("/join/").pop()!.replace(/\W/g, ""));
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="rise-in">
      <PageHeader
        title={
          <>
            <span className="block text-sm font-medium tracking-normal text-muted-fg">{greeting}</span>
            {me ? firstName(me.name) : "Groups"}
          </>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen("join")}>
              <LinkIcon size={16} />
              <span className="max-sm:hidden">Join group</span>
              <span className="sm:hidden">Join</span>
            </Button>
            <Button size="sm" onClick={() => setOpen("create")} className="max-sm:hidden">
              <PlusIcon size={16} strokeWidth={2.5} />
              New group
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid gap-6 lg:order-2 lg:sticky lg:top-8">
          <BalanceHero owed={owed} owe={owe} loading={friends.isPending}>
            {me && !me.upi_id && !me.has_upi_qr && (
              <button
                type="button"
                onClick={() => setOpen("upi")}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-primary px-3.5 py-3 text-left text-primary-fg transition hover:brightness-[1.04]"
              >
                <QrIcon size={20} />
                <span className="flex-1 text-sm font-semibold">Add your UPI ID to get paid in one tap</span>
                <ChevronRightIcon size={18} />
              </button>
            )}
          </BalanceHero>
        </div>

        <section aria-label="Groups" className="lg:order-1">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-fg">Your groups</h2>
            <button
              type="button"
              onClick={() => setOpen("create")}
              className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary-soft-fg hover:bg-primary-soft sm:hidden"
            >
              <PlusIcon size={16} strokeWidth={2.5} /> New
            </button>
          </div>
          {isPending ? (
            <ListSkeleton rows={3} tile="rounded-2xl" />
          ) : isError ? (
            <ErrorState description="Couldn't load your groups." action={() => void refetch()} />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={GroupsIcon}
              title="No groups yet"
              description="Create a group for your flat, a trip or a dinner club — then add expenses as they happen."
              action={<Button onClick={() => setOpen("create")}>Create your first group</Button>}
            />
          ) : (
            <ul className="-mx-3 grid grid-cols-[minmax(0,1fr)] gap-0.5">
              {groups.map((g) => (
                <GroupRow key={g.id} group={g} net={nets.get(g.id)} loading={friends.isPending} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog
        open={open === "create"}
        onClose={close}
        title="New group"
        footer={
          <Button type="submit" form="create-group" size="lg" className="w-full" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create group"}
          </Button>
        }
      >
        <form id="create-group" onSubmit={onCreate} className="grid gap-4 pt-1">
          <Field label="Group name">
            <Input name="name" required maxLength={255} placeholder="Goa trip, Flat 302…" autoFocus />
          </Field>
          <Field label="Currency" hint="Balances in this group are kept in this currency.">
            <select name="currency" defaultValue="INR" className={`${inputClass} cursor-pointer`}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <FormError>{error}</FormError>
        </form>
      </Dialog>

      <Dialog
        open={open === "join"}
        onClose={close}
        title="Join a group"
        footer={
          <Button type="submit" form="join-group" size="lg" className="w-full" disabled={join.isPending}>
            {join.isPending ? "Joining…" : "Join"}
          </Button>
        }
      >
        <form id="join-group" onSubmit={onJoin} className="grid gap-4 pt-1">
          <Field label="Invite code or link" hint="Ask a member to share it from the group's settings.">
            <Input name="code" required autoComplete="off" autoCapitalize="off" placeholder="e.g. 3fa1b2" autoFocus />
          </Field>
          <FormError>{error}</FormError>
        </form>
      </Dialog>

      {me && (
        <Dialog open={open === "upi"} onClose={close} title="Payment details">
          <PaymentForm me={me} />
        </Dialog>
      )}
    </div>
  );
}
