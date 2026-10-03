import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate, useParams } from "react-router";
import { api, getMe, joinGroup } from "./api";
import { Avatar } from "./components/Avatar";
import { Button } from "./components/Button";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import GroupDetail from "./pages/GroupDetail";
import Analytics from "./pages/Analytics";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";

/** Current session query. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: getMe });
}

/** Redirects to /login unless a session exists; renders the app shell. */
function RequireAuth() {
  const { data: me, isPending } = useMe();
  if (isPending) return null;
  if (!me) return <Navigate to="/login" replace />;
  return <Shell />;
}

const tabs = [
  { to: "/", label: "Home", end: true },
  { to: "/activity", label: "Activity" },
  { to: "/settings", label: "Settings" },
];

function Shell() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: () => api("/users/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <NavLink to="/" className="font-semibold">
              Splitwise
            </NavLink>
            <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
              {tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-muted font-medium text-fg" : "text-muted-fg hover:text-fg"}`
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </nav>
          </div>
          {me && (
            <>
              <button
                popoverTarget="user-menu"
                className="cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [anchor-name:--avatar]"
                aria-label="Account menu"
              >
                <Avatar name={me.name} size={32} />
              </button>
              <div
                id="user-menu"
                popover="auto"
                className="m-0 w-48 rounded-card border border-border bg-card p-1 text-fg shadow-lg [position-anchor:--avatar] [position-area:bottom-end]"
              >
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-medium">{me.name}</p>
                  <p className="truncate text-xs text-muted-fg">{me.email}</p>
                </div>
                <Button variant="ghost" className="w-full justify-start" onClick={() => logout.mutate()}>
                  Log out
                </Button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:pb-10">
        <Outlet />
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `py-3 text-center text-sm ${isActive ? "font-semibold text-fg" : "text-muted-fg"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Joins via invite code, then navigates to the group. Mounted inside RequireAuth (401 → /login). */
function JoinGroup() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const join = useMutation({
    mutationFn: () => joinGroup(code),
    onSuccess: (group) => navigate(`/groups/${group.id}`, { replace: true }),
    onError: (e) => setError(e instanceof Error ? e.message : "Could not join group"),
    // ponytail: fire-on-mount join; retry UI not worth it — user can revisit the link
  });
  useEffect(() => {
    join.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <Route path="/join/:code" element={<JoinGroup />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
