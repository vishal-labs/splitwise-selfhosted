import { useQuery } from "@tanstack/react-query";
import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useMatch, useNavigate, useParams } from "react-router";
import { getMe, joinGroup } from "./api";
import { Avatar } from "./components/Avatar";
import { ActivityIcon, GroupsIcon, PlusIcon, UserIcon, UsersIcon, type Icon } from "./components/icons";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import GroupDetail from "./pages/GroupDetail";
import Activity from "./pages/Activity";
import Friends from "./pages/Friends";
import Settings from "./pages/Settings";
import AddExpense from "./pages/AddExpense";
import { BrandMark } from "./components/Brand";
import { Block } from "./components/Skeleton";

// charts (recharts) are the bulk of the bundle — only load them on the Totals page
const Analytics = lazy(() => import("./pages/Analytics"));

/** Current session query. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: getMe });
}

/** Opens the add-expense sheet from anywhere; `groupId` preselects a group. */
const AddExpenseContext = createContext<(groupId?: string) => void>(() => {});
// eslint-disable-next-line react-refresh/only-export-components
export const useAddExpense = () => useContext(AddExpenseContext);

/** Redirects to /login unless a session exists; renders the app shell. */
function RequireAuth() {
  const { data: me, isPending } = useMe();
  if (isPending) return null;
  if (!me) return <Navigate to="/login" replace />;
  return <Shell />;
}

const tabs: { to: string; label: string; icon: Icon; end?: boolean }[] = [
  { to: "/", label: "Groups", icon: GroupsIcon, end: true },
  { to: "/friends", label: "Friends", icon: UsersIcon },
  { to: "/activity", label: "Activity", icon: ActivityIcon },
  { to: "/settings", label: "Account", icon: UserIcon },
];

function Shell() {
  const { data: me } = useMe();
  const groupMatch = useMatch("/groups/:id");
  // undefined = closed; "" = open with no group chosen yet
  const [adding, setAdding] = useState<string | undefined>(undefined);
  const openAdd = (groupId?: string) => setAdding(groupId ?? groupMatch?.params.id ?? "");

  return (
    <AddExpenseContext.Provider value={openAdd}>
      <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)] lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-border bg-card/60 px-3 py-5 md:flex">
          <NavLink to="/" className="mb-5 flex items-center gap-2.5 px-3 text-lg font-bold tracking-tight">
            <BrandMark size={30} />
            Splitwise
          </NavLink>
          <button
            type="button"
            onClick={() => openAdd()}
            className="mb-4 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-fg shadow-card transition hover:brightness-[1.04] active:scale-[0.98]"
          >
            <PlusIcon size={18} strokeWidth={2.5} />
            Add expense
          </button>
          <nav aria-label="Primary" className="grid gap-0.5">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors ${
                    isActive ? "bg-primary-soft font-semibold text-primary-soft-fg" : "font-medium text-muted-fg hover:bg-muted hover:text-fg"
                  }`
                }
              >
                <t.icon size={20} />
                {t.label}
              </NavLink>
            ))}
          </nav>
          {me && (
            <NavLink
              to="/settings"
              className="mt-auto flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted"
            >
              <Avatar name={me.name} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{me.name}</span>
                <span className="block truncate text-xs text-muted-fg">{me.email}</span>
              </span>
            </NavLink>
          )}
        </aside>

        <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 md:px-8 md:pb-12 md:pt-8">
          <Suspense fallback={<Block className="h-64" />}>
            <Outlet />
          </Suspense>
        </main>

        {/* Mobile tab bar with a raised add button in the middle */}
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/92 pb-safe backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-stretch">
            {tabs.slice(0, 2).map((t) => (
              <TabLink key={t.to} {...t} />
            ))}
            <div className="flex items-start justify-center">
              <button
                type="button"
                onClick={() => openAdd()}
                aria-label="Add expense"
                className="-mt-5 inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-fg shadow-float ring-4 ring-bg transition active:scale-95"
              >
                <PlusIcon size={26} strokeWidth={2.5} />
              </button>
            </div>
            {tabs.slice(2).map((t) => (
              <TabLink key={t.to} {...t} />
            ))}
          </div>
        </nav>
      </div>

      {adding !== undefined && (
        <AddExpense groupId={adding || undefined} onClose={() => setAdding(undefined)} />
      )}
    </AddExpenseContext.Provider>
  );
}

function TabLink({ to, label, icon: Icon, end }: (typeof tabs)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 text-[0.6875rem] transition-colors ${
          isActive ? "font-semibold text-fg" : "font-medium text-muted-fg"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive ? "bg-primary-soft text-primary-soft-fg" : ""}`}>
            <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Joins via invite code, then navigates to the group. Mounted inside RequireAuth (401 → /login). */
function JoinGroup() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    // ponytail: fire-on-mount join; retry UI not worth it — user can revisit the link
    joinGroup(code)
      .then((group) => navigate(`/groups/${group.id}`, { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not join group"));
  }, [code, navigate]);

  return <p className="text-muted-fg">{error || "Joining…"}</p>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/groups/:id/totals" element={<Analytics />} />
        <Route path="/join/:code" element={<JoinGroup />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
