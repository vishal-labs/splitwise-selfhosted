import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, ApiError } from "../api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useMe } from "../App";

export default function Login() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api("/users/login", { body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/", { replace: true });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  if (me) return <Navigate to="/" replace />;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    login.mutate({
      email: data.get("email") as string,
      password: data.get("password") as string,
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Log in</h1>
        <form onSubmit={onSubmit} className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            Email
            <Input name="email" type="email" required autoComplete="email" className="user-invalid:border-destructive" />
          </label>
          <label className="grid gap-1.5 text-sm">
            Password
            <Input name="password" type="password" required autoComplete="current-password" className="user-invalid:border-destructive" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-fg">
          No account?{" "}
          <Link to="/register" className="font-medium text-fg underline underline-offset-2">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
