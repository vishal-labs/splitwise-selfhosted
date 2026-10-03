import { useGroups } from "../api";
import { useMe } from "../App";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
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
    </div>
  );
}
