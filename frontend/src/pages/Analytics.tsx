import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAnalytics, useGroups } from "../api";
import { CategoryTile } from "../components/CategoryTile";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ChartIcon, ChevronLeftIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Block } from "../components/Skeleton";
import { Tabs } from "../components/Tabs";
import { formatMinor } from "../format";

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString(undefined, { month: "short" });
}

/** Compact axis ticks: ₹12k, ₹1.2L-free (plain k/M keeps it locale-neutral). */
function compact(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 1 }).format(minor / 100);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-fg">{label}</p>
      <p className="tabular mt-1 truncate text-xl font-bold tracking-tight md:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-fg">{sub}</p>}
    </div>
  );
}

/** Group spending: headline totals, month-by-month bars, ranked categories.
 *  Reached as /groups/:id/totals (fixed group) or /analytics (group picker). */
export default function Analytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: groups, isPending: groupsPending, isError: groupsError, refetch: refetchGroups } = useGroups();
  const [months, setMonths] = useState("6");
  const group = groups?.find((g) => String(g.id) === id) ?? (id ? undefined : groups?.[0]);
  const { data, isPending, isError, refetch } = useAnalytics(group?.id ?? 0, Number(months));

  const header = (
    <>
      {id && (
        <Link to={`/groups/${id}`} className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pl-1.5 pr-3 text-sm font-medium text-muted-fg hover:bg-muted hover:text-fg">
          <ChevronLeftIcon size={20} /> {group?.name ?? "Group"}
        </Link>
      )}
      <PageHeader title="Totals" subtitle={group ? `Spending in ${group.name}` : undefined} />
    </>
  );

  if (groupsPending) return <div>{header}<Block className="h-64" /></div>;
  if (groupsError) return <div>{header}<ErrorState description="Couldn't load your groups." action={() => void refetchGroups()} /></div>;
  if (!group) return <div>{header}<EmptyState icon={ChartIcon} title="No groups yet" description="Create a group to see spending totals." /></div>;

  const currency = group.currency;
  const monthly = data?.monthly.map((m) => ({ ...m, label: monthLabel(m.month) })) ?? [];
  const s = data?.summary;
  const maxCat = Math.max(1, ...(data?.by_category.map((c) => c.total) ?? [1]));

  return (
    <div className="rise-in mx-auto max-w-3xl">
      {header}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {!id && groups && groups.length > 1 ? (
          <select
            aria-label="Group"
            className="menu-select h-10 border border-border bg-card text-sm"
            value={group.id}
            onChange={(e) => navigate(`/groups/${e.target.value}/totals`)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        <Tabs
          label="Time range"
          tabs={[
            { id: "3", label: "3 mo" },
            { id: "6", label: "6 mo" },
            { id: "12", label: "1 yr" },
          ]}
          value={months}
          onChange={setMonths}
        />
      </div>

      {isPending ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Block className="h-20" />
            <Block className="h-20" />
            <Block className="h-20" />
          </div>
          <Block className="h-64" />
        </div>
      ) : isError ? (
        <ErrorState description="Couldn't load totals." action={() => void refetch()} />
      ) : !s || s.total === 0 ? (
        <EmptyState icon={ChartIcon} title="No spending yet" description="No expenses in this period." />
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Stat label="Group spent" value={formatMinor(s.total, currency)} />
            </div>
            <Stat label="You paid" value={formatMinor(s.you_paid, currency)} sub={`${Math.round((s.you_paid / s.total) * 100)}% of the total`} />
            <Stat label="Your share" value={formatMinor(s.your_share, currency)} sub={`${Math.round((s.your_share / s.total) * 100)}% of the total`} />
          </div>

          <section aria-label="Spending per month" className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <h2 className="font-semibold">Spending per month</h2>
            <p className="text-sm text-muted-fg">Total group spending, all members</p>
            <div className="mt-4 h-56 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="28%">
                  <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-fg)" }} />
                  <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 12, fill: "var(--muted-fg)" }} tickFormatter={(v: number) => compact(v, currency)} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", radius: 6 }}
                    formatter={(v) => [formatMinor(Number(v), currency), "Spent"]}
                    labelStyle={{ color: "var(--muted-fg)", fontSize: 12 }}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--fg)", boxShadow: "var(--shadow-md)" }}
                  />
                  <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Spending per month</caption>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <th scope="row">{m.month}</th>
                    <td>{formatMinor(m.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-label="Spending by category" className="rounded-2xl border border-border bg-card p-4 md:p-5">
            <h2 className="font-semibold">By category</h2>
            <ul className="mt-4 grid gap-3.5">
              {data.by_category.map((c) => (
                <li key={c.category} className="flex items-center gap-3">
                  <CategoryTile category={c.category} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium capitalize">{c.category}</span>
                      <span className="tabular shrink-0 font-semibold">
                        {formatMinor(c.total, currency)}
                        <span className="ml-1.5 font-normal text-muted-fg">{Math.round((c.total / s.total) * 100)}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
