import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAnalytics, useGroups } from "../api";
import { formatMinor } from "../format";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";

const MONTHS = [3, 6, 12] as const;

/** Chart palette from tokens.css (amber primary + accent + positive + more hues). */
const COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--positive)",
  "oklch(0.6 0.12 25)",
  "oklch(0.6 0.12 200)",
  "oklch(0.6 0.12 340)",
  "oklch(0.6 0.12 100)",
  "oklch(0.6 0.12 260)",
];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export default function Analytics() {
  const { data: groups, isPending: groupsPending, isError: groupsError, refetch: refetchGroups } = useGroups();
  const [groupId, setGroupId] = useState<number | "">("");
  const [months, setMonths] = useState<number>(6);

  const group = groups?.find((g) => g.id === groupId) ?? groups?.[0];
  const { data, isPending, isError, refetch } = useAnalytics(group?.id ?? 0, months);

  if (groupsPending) return <p className="text-muted-fg">Loading…</p>;
  if (groupsError)
    return (
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <div className="mt-4">
          <ErrorState description="Couldn't load your groups." action={() => void refetchGroups()} />
        </div>
      </div>
    );
  if (!groups?.length)
    return <EmptyState title="No groups yet" description="Create a group to see spending analytics." />;

  const monthly = data?.monthly.map((m) => ({ ...m, label: monthLabel(m.month) })) ?? [];
  const total = monthly.reduce((s, m) => s + m.total, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Analytics</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Group"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          value={group?.id ?? ""}
          onChange={(e) => setGroupId(Number(e.target.value))}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Time range"
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
        >
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              Last {m} months
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <p className="mt-6 text-muted-fg">Loading…</p>
      ) : isError ? (
        <div className="mt-6">
          <ErrorState description="Couldn't load analytics." action={() => void refetch()} />
        </div>
      ) : total === 0 ? (
        <div className="mt-6">
          <EmptyState title="No spending" description="No expenses in this period." />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-fg">
            Total spent: <span className="font-medium text-fg">{formatMinor(total, group!.currency)}</span>
          </p>

          <section aria-label="Monthly spending" className="mt-4 rounded-card border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Monthly spend</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-fg)" }} />
                  <YAxis
                    tick={{ fontSize: 12, fill: "var(--muted-fg)" }}
                    tickFormatter={(v: number) => formatMinor(v, group!.currency)}
                    width={70}
                  />
                  <Tooltip
                    formatter={(v) => formatMinor(Number(v), group!.currency)}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--card-fg)",
                    }}
                  />
                  <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section aria-label="Spending by category" className="mt-4 rounded-card border border-border bg-card p-4">
            <h2 className="text-sm font-medium">By category</h2>
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-64 w-full max-w-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data!.by_category}
                      dataKey="total"
                      nameKey="category"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                    >
                      {data!.by_category.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [formatMinor(Number(v), group!.currency), name]}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--card-fg)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="grid gap-1.5 text-sm">
                {data!.by_category.map((c, i) => (
                  <li key={c.category} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block size-3 rounded-sm"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="capitalize">{c.category}</span>
                    <span className="text-muted-fg">{formatMinor(c.total, group!.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
