import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { api, changePassword, updateMe, useGroups } from "../api";
import { useMe } from "../App";
import { Avatar, GroupAvatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { ChevronRightIcon, DownloadIcon, LockIcon, LogOutIcon, MonitorIcon, MoonIcon, PencilIcon, QrIcon, SunIcon, type Icon } from "../components/icons";
import { Field, FormError, Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";
import { PaymentForm } from "../components/PaymentForm";
import { useToast } from "../components/Toast";
import { getTheme, setTheme, type Theme } from "../theme";

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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-fg">{title}</h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </section>
  );
}

function Row({ icon: Icon, label, detail, onClick, tone }: { icon: Icon; label: string; detail?: ReactNode; onClick: () => void; tone?: "danger" }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-muted text-fg"}`}>
        <Icon size={18} />
      </span>
      <span className={`min-w-0 flex-1 font-medium ${tone === "danger" ? "text-destructive" : ""}`}>{label}</span>
      {detail && <span className="shrink-0 text-sm text-muted-fg">{detail}</span>}
      {tone !== "danger" && <ChevronRightIcon size={18} className="shrink-0 text-muted-fg/70" />}
    </button>
  );
}

const THEMES: { id: Theme; label: string; icon: Icon }[] = [
  { id: "system", label: "System", icon: MonitorIcon },
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
];

export default function Settings() {
  const { data: me } = useMe();
  const { data: groups } = useGroups();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState<"profile" | "upi" | "password" | "export" | null>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme);

  const logout = useMutation({
    mutationFn: () => api("/users/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  if (!me) return null;
  const close = () => setOpen(null);

  return (
    <div className="rise-in mx-auto max-w-2xl">
      <PageHeader title="Account" />

      <button
        type="button"
        onClick={() => setOpen("profile")}
        className="mb-7 flex w-full cursor-pointer items-center gap-4 rounded-[1.375rem] bg-hero p-5 text-left text-hero-fg shadow-float"
      >
        <Avatar name={me.name} size={60} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xl font-bold">{me.name}</span>
          <span className="block truncate text-sm text-hero-fg/70">{me.email}</span>
        </span>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-hero-fg/10">
          <PencilIcon size={17} />
        </span>
      </button>

      <div className="grid gap-7">
        <Group title="Payments">
          <Row
            icon={QrIcon}
            label="UPI details"
            detail={me.upi_id ?? (me.has_upi_qr ? "QR uploaded" : <span className="font-medium text-primary-soft-fg">Set up</span>)}
            onClick={() => setOpen("upi")}
          />
        </Group>

        <section className="grid gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-fg">Appearance</h2>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme === t.id}
                onClick={() => {
                  setTheme(t.id);
                  setThemeState(t.id);
                }}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-2 py-3.5 text-sm font-medium transition-colors ${
                  theme === t.id ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-card hover:bg-muted"
                }`}
              >
                <t.icon size={20} />
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <Group title="Account">
          <Row icon={LockIcon} label="Change password" onClick={() => setOpen("password")} />
          <Row icon={DownloadIcon} label="Export data" detail="CSV" onClick={() => setOpen("export")} />
        </Group>

        <Group title="Session">
          <Row icon={LogOutIcon} label={logout.isPending ? "Logging out…" : "Log out"} tone="danger" onClick={() => logout.mutate()} />
        </Group>

        <p className="text-center text-xs text-muted-fg">Self-hosted Splitwise · your data stays on your server</p>
      </div>

      {open === "profile" && <ProfileDialog onClose={close} />}
      <Dialog open={open === "upi"} onClose={close} title="UPI details">
        <PaymentForm me={me} />
      </Dialog>
      {open === "password" && (
        <ChangePasswordDialog
        onClose={close}
        onSaved={() => {
          close();
          toast("Password updated · other devices were signed out");
        }}
        />
      )}
      <Dialog open={open === "export"} onClose={close} title="Export data">
        <p className="mb-3 text-sm text-muted-fg">Download every expense in a group as a CSV spreadsheet.</p>
        {groups?.length ? (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                <GroupAvatar name={g.name} size={36} />
                <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void downloadCsv(g.id, g.name).catch(() => toast("Export failed", { tone: "error" }))}
                >
                  <DownloadIcon size={15} /> CSV
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-fg">No groups to export yet.</p>
        )}
      </Dialog>
    </div>
  );
}

/** Mounted only while open, so fields start fresh from `me` each time. */
function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me?.name ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () =>
      updateMe({
        name: name.trim() !== me!.name ? name.trim() : undefined,
        email: email.trim() !== me!.email ? email.trim() : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast("Profile saved");
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  if (!me) return null;
  const dirty = name.trim() !== me.name || email.trim() !== me.email;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit profile"
      footer={
        <Button type="submit" form="profile-form" size="lg" className="w-full" disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      }
    >
      <form
        id="profile-form"
        className="grid gap-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate();
        }}
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <FormError>{error}</FormError>
      </form>
    </Dialog>
  );
}

/** Mounted only while open, so fields start empty each time. */
function ChangePasswordDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const change = useMutation({
    mutationFn: () => changePassword({ current_password: current, new_password: next }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError("New passwords don't match");
    setError("");
    change.mutate();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Change password"
      footer={
        <Button type="submit" form="password-form" size="lg" className="w-full" disabled={change.isPending}>
          {change.isPending ? "Updating…" : "Update password"}
        </Button>
      }
    >
      <form id="password-form" className="grid gap-4 pt-1" onSubmit={submit}>
        <Field label="Current password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <FormError>{error}</FormError>
      </form>
    </Dialog>
  );
}
