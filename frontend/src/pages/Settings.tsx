import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { changePassword, updateMe, useGroups } from "../api";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Input } from "../components/Input";
import { PaymentForm } from "../components/PaymentForm";

async function downloadCsv(groupId: number, name: string) {
  const res = await fetch(`/api/groups/${groupId}/export.csv`, { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `group-${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const { data: me } = useMe();
  const { data: groups, isPending, isError, refetch } = useGroups();
  const [pwOpen, setPwOpen] = useState(false);
  const [pwStatus, setPwStatus] = useState("");

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>

      {me && <ProfileBlock me={me} />}

      <section aria-label="Security" className="mt-6">
        <h2 className="font-medium">Security</h2>
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" onClick={() => setPwOpen(true)}>
            Change password
          </Button>
          {pwStatus && (
            <p role="status" className="text-sm text-muted-fg">
              {pwStatus}
            </p>
          )}
        </div>
      </section>

      <section aria-label="Data export" className="mt-6">
        <h2 className="font-medium">Export data</h2>
        <p className="mt-1 text-sm text-muted-fg">Download all expenses for a group as CSV.</p>
        {isPending ? (
          <p className="mt-4 text-sm text-muted-fg">Loading…</p>
        ) : isError ? (
          <div className="mt-4">
            <ErrorState description="Couldn't load your groups." action={() => void refetch()} />
          </div>
        ) : !groups?.length ? (
          <div className="mt-4">
            <EmptyState title="No groups" description="Create a group first to export its data." />
          </div>
        ) : (
          <ul className="mt-4 grid gap-2">
            {groups.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-3"
              >
                <span className="truncate text-sm font-medium">{g.name}</span>
                <Button variant="secondary" onClick={() => void downloadCsv(g.id, g.name)}>
                  Download CSV
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {me && (
        <section aria-label="Payment" className="mt-6">
          <h2 className="font-medium">Payment</h2>
          <div className="mt-3">
            <PaymentForm me={me} />
          </div>
        </section>
      )}

      <section aria-label="Appearance" className="mt-6">
        <h2 className="font-medium">Appearance</h2>
        <p className="mt-1 text-sm text-muted-fg">
          Dark mode follows your operating system preference automatically.
        </p>
      </section>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} onSaved={setPwStatus} />
    </div>
  );
}

function ProfileBlock({ me }: { me: NonNullable<ReturnType<typeof useMe>["data"]> }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Reset fields when `me` changes (e.g. after invalidation).
  useEffect(() => {
    setName(me.name);
    setEmail(me.email);
  }, [me.name, me.email]);

  const save = useMutation({
    mutationFn: () =>
      updateMe({
        name: name.trim() !== me.name ? name.trim() : undefined,
        email: email.trim() !== me.email ? email.trim() : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setError("");
      setStatus("Saved ✓");
      window.setTimeout(() => setStatus(""), 2000);
    },
    onError: (e) => {
      setStatus("");
      setError(e instanceof Error ? e.message : "Something went wrong");
    },
  });

  const dirty = name.trim() !== me.name || email.trim() !== me.email;

  return (
    <section aria-label="Profile" className="mt-4 grid gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <Avatar name={me.name} size={48} />
        <div className="min-w-0">
          <p className="truncate font-medium">{me.name}</p>
          <p className="truncate text-sm text-muted-fg">{me.email}</p>
        </div>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate();
        }}
      >
        <label className="grid gap-1.5 text-sm">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="grid gap-1.5 text-sm">
          Email
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : status ? (
            <p className="text-sm text-muted-fg">{status}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function ChangePasswordDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [error, setError] = useState("");

  const change = useMutation({
    mutationFn: () => changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      onClose();
      onSaved("Password updated");
      window.setTimeout(() => onSaved(""), 3000);
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Something went wrong");
    },
  });

  // Reset fields whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setConfirmError("");
      setError("");
    }
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setConfirmError("Passwords do not match");
      return;
    }
    setConfirmError("");
    change.mutate();
  };

  return (
      <Dialog open={open} onClose={onClose} title="Change password">
        <form className="grid gap-3" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm">
            Current password
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            New password
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Confirm new password
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {confirmError && (
            <p role="alert" className="text-sm text-destructive">
              {confirmError}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </Dialog>
  );
}
