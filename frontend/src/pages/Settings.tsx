import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  deleteUpiQr,
  updateMe,
  uploadUpiQr,
  upiQrUrl,
  useGroups,
  type User,
} from "../api";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { isValidVpa } from "../upi";

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

function PaymentSection({ me }: { me: User }) {
  const queryClient = useQueryClient();
  const [vpa, setVpa] = useState(me.upi_id ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const invalid = vpa.trim().length > 0 && !isValidVpa(vpa.trim());

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["me"] });
  const fail = (e: unknown) => {
    setStatus("");
    setError(e instanceof Error ? e.message : "Something went wrong");
  };

  const save = useMutation({
    mutationFn: () => updateMe({ upi_id: vpa.trim() || null }),
    onSuccess: () => {
      refresh();
      setError("");
      setStatus("UPI ID saved");
    },
    onError: fail,
  });

  const clear = useMutation({
    mutationFn: () => updateMe({ upi_id: null }),
    onSuccess: () => {
      refresh();
      setVpa("");
      setError("");
      setStatus("UPI ID cleared");
    },
    onError: fail,
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadUpiQr(file),
    onSuccess: () => {
      refresh();
      setError("");
      setStatus("QR uploaded");
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => deleteUpiQr(),
    onSuccess: () => {
      refresh();
      setError("");
      setStatus("QR removed");
    },
    onError: fail,
  });

  return (
    <section aria-label="Payment" className="mt-6">
      <h2 className="font-medium">Payment</h2>
      <p className="mt-1 text-sm text-muted-fg">
        Add your UPI ID and people can pay you with a QR that has the amount pre-filled — no typing.
        Don&apos;t know your UPI ID? Upload your UPI QR image instead.
      </p>

      <div className="mt-4 grid gap-2 rounded-card border border-border bg-card p-4">
        <label className="grid gap-1.5 text-sm">
          UPI ID
          <Input
            value={vpa}
            onChange={(e) => setVpa(e.target.value)}
            placeholder="name@bank"
            autoComplete="off"
          />
        </label>
        {invalid && (
          <p className="text-xs text-destructive">Enter a valid UPI ID like name@bank</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={invalid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {me.upi_id && (
            <Button variant="secondary" disabled={clear.isPending} onClick={() => clear.mutate()}>
              {clear.isPending ? "Clearing…" : "Clear"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-card border border-border bg-card p-4">
        <p className="text-sm font-medium">UPI QR image</p>
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf"
          disabled={upload.isPending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
          className="text-sm text-muted-fg file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm file:text-fg"
        />
        {me.has_upi_qr && (
          <div className="grid gap-2">
            <img
              src={upiQrUrl(me.id)}
              alt="Your UPI QR"
              className="max-h-64 max-w-full rounded-card border border-border object-contain"
            />
            <Button variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Removing…" : "Remove QR"}
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : status ? (
        <p className="mt-2 text-sm text-muted-fg">{status}</p>
      ) : null}
    </section>
  );
}

export default function Settings() {
  const { data: me } = useMe();
  const { data: groups, isPending } = useGroups();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>

      {me && (
        <section aria-label="Profile" className="mt-4 flex items-center gap-4 rounded-card border border-border bg-card p-4">
          <Avatar name={me.name} size={48} />
          <div className="min-w-0">
            <p className="truncate font-medium">{me.name}</p>
            <p className="truncate text-sm text-muted-fg">{me.email}</p>
          </div>
        </section>
      )}

      <section aria-label="Data export" className="mt-6">
        <h2 className="font-medium">Export data</h2>
        <p className="mt-1 text-sm text-muted-fg">Download all expenses for a group as CSV.</p>
        {isPending ? (
          <p className="mt-4 text-sm text-muted-fg">Loading…</p>
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

      {me && <PaymentSection me={me} />}

      <section aria-label="Appearance" className="mt-6">
        <h2 className="font-medium">Appearance</h2>
        <p className="mt-1 text-sm text-muted-fg">
          Dark mode follows your operating system preference automatically.
        </p>
      </section>
    </div>
  );
}
