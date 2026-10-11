import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { addMember, ApiError, deleteGroup, removeMember, updateGroup, type GroupDetail, type User } from "../../api";
import { shareText } from "../../balance";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { CheckIcon, CopyIcon, DownloadIcon, LogOutIcon, ShareIcon, TrashIcon, UserPlusIcon, XIcon } from "../../components/icons";
import { FormError, Input } from "../../components/Input";
import { useToast } from "../../components/Toast";

async function downloadCsv(groupId: number, name: string) {
  const res = await fetch(`/api/groups/${groupId}/export.csv`, { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase()}-expenses.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-fg">{title}</h3>
      {children}
    </section>
  );
}

export function GroupSettings({ group, me, onClose }: { group: GroupDetail; me: User; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = group.members.find((m) => m.id === me.id)?.role === "admin";
  const [name, setName] = useState(group.name);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [needName, setNeedName] = useState(false);
  const inviteUrl = `${location.origin}/join/${group.invite_code}`;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["group", String(group.id)] });
    queryClient.invalidateQueries({ queryKey: ["groups"] });
    queryClient.invalidateQueries({ queryKey: ["friends"] });
    queryClient.invalidateQueries({ queryKey: ["debts", String(group.id)] });
  };

  const save = useMutation({
    mutationFn: (body: { name?: string; simplify_debts?: boolean }) => updateGroup(group.id, body),
    onSuccess: (_, body) => {
      refresh();
      toast(body.name ? "Group renamed" : body.simplify_debts ? "Simplify debts on" : "Simplify debts off");
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Couldn't save", { tone: "error" }),
  });

  const add = useMutation({
    mutationFn: ({ email, name }: { email: string; name: string }) => addMember(group.id, email, name || undefined),
    onSuccess: (m, vars) => {
      refresh();
      setMemberError("");
      setNeedName(false);
      toast(m.pending ? `Invited ${vars.name} — they'll join when they sign up with ${vars.email}` : `Added ${m.name}`);
      (document.getElementById("add-member") as HTMLFormElement | null)?.reset();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 404) {
        setNeedName(true);
        setMemberError("They're not on Splitwise yet — add their name to invite them.");
      } else setMemberError(e instanceof Error ? e.message : "Something went wrong");
    },
  });

  const remove = useMutation({
    mutationFn: (userId: number) => removeMember(group.id, userId),
    onSuccess: (_, userId) => {
      refresh();
      if (userId === me.id) {
        onClose();
        navigate("/");
        toast(`You left ${group.name}`);
      }
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Couldn't remove", { tone: "error" }),
  });

  const del = useMutation({
    mutationFn: () => deleteGroup(group.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      onClose();
      navigate("/");
      toast(`Deleted ${group.name}`);
    },
  });

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    add.mutate({ email: (data.get("email") as string).trim(), name: ((data.get("name") as string) ?? "").trim() });
  }

  return (
    <Dialog open onClose={onClose} title="Group settings" width="32rem">
      <div className="grid gap-6 pt-1">
        {isAdmin && (
          <Section title="Name">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && name.trim() !== group.name) save.mutate({ name: name.trim() });
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} required aria-label="Group name" />
              <Button type="submit" variant="secondary" className="h-12" disabled={!name.trim() || name.trim() === group.name || save.isPending}>
                Save
              </Button>
            </form>
          </Section>
        )}

        <Section title="Invite">
          <div className="grid gap-2 rounded-2xl border border-border p-3">
            <p className="truncate rounded-xl bg-muted px-3 py-2.5 font-mono text-sm">{inviteUrl}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void shareText(`Join “${group.name}” on Splitwise: ${inviteUrl}`)}>
                <ShareIcon size={16} /> Share
              </Button>
            </div>
            <p className="px-1 text-xs text-muted-fg">
              Invite code <span className="font-mono font-semibold text-fg">{group.invite_code}</span>
            </p>
          </div>
        </Section>

        <Section title={`Members · ${group.members.length}`}>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {group.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={m.name} size={36} pending={m.pending} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {m.id === me.id ? `${m.name} (you)` : m.name}
                    {m.role === "admin" && <span className="rounded-full bg-muted px-1.5 py-px text-[0.625rem] font-semibold uppercase text-muted-fg">admin</span>}
                    {m.pending && <span className="rounded-full bg-primary-soft px-1.5 py-px text-[0.625rem] font-semibold uppercase text-primary-soft-fg">invited</span>}
                  </p>
                  <p className="truncate text-xs text-muted-fg">{m.email}</p>
                </div>
                {m.id === me.id
                  ? group.members.length > 1 && (
                      <Button variant="ghost" size="sm" className="text-muted-fg" disabled={remove.isPending} onClick={() => remove.mutate(m.id)}>
                        <LogOutIcon size={15} /> Leave
                      </Button>
                    )
                  : isAdmin && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} className="text-muted-fg hover:text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(m.id)}>
                        <XIcon size={16} />
                      </Button>
                    )}
              </li>
            ))}
          </ul>
          <p className="px-1 text-xs text-muted-fg">Members must be settled up before they can leave.</p>

          <form id="add-member" onSubmit={onAdd} className="grid gap-2 rounded-2xl bg-muted p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <UserPlusIcon size={16} /> Add someone
            </p>
            <Input name="email" type="email" required placeholder="Email address" autoComplete="off" inputMode="email" onChange={() => needName && setMemberError("")} />
            <Input name="name" placeholder={needName ? "Their name (required to invite)" : "Name (only needed if they're new)"} required={needName} autoComplete="off" />
            <FormError>{memberError}</FormError>
            <Button type="submit" size="sm" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add to group"}
            </Button>
          </form>
        </Section>

        {isAdmin && (
          <Section title="Balances">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3.5">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Simplify debts</span>
                <span className="block text-sm text-muted-fg">
                  Reroute who-pays-whom so the group settles in the fewest payments. Totals stay the same.
                </span>
              </span>
              <input
                type="checkbox"
                className="switch mt-0.5"
                checked={group.simplify_debts}
                disabled={save.isPending}
                onChange={(e) => save.mutate({ simplify_debts: e.target.checked })}
              />
            </label>
          </Section>
        )}

        <Section title="Data">
          <Button variant="secondary" className="justify-start" onClick={() => void downloadCsv(group.id, group.name).catch(() => toast("Export failed", { tone: "error" }))}>
            <DownloadIcon size={16} /> Export expenses as CSV
          </Button>
          {group.created_by === me.id &&
            (confirmDelete ? (
              <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 p-3">
                <p className="flex-1 text-sm text-destructive">Delete the group and all its expenses? This can't be undone.</p>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" disabled={del.isPending} onClick={() => del.mutate()}>
                  Delete
                </Button>
              </div>
            ) : (
              <Button variant="ghost" className="justify-start text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
                <TrashIcon size={16} /> Delete group
              </Button>
            ))}
        </Section>
      </div>
    </Dialog>
  );
}
