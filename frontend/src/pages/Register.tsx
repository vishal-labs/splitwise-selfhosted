import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, ApiError } from "../api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useMe } from "../App";

export default function Register() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const register = useMutation({
    mutationFn: (body: { email: string; name: string; password: string }) =>
      api("/users/register", { body }),
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
    register.mutate({
      email: data.get("email") as string,
      name: data.get("name") as string,
      password: data.get("password") as string,
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Create account</h1>
        <form onSubmit={onSubmit} className="mt-4 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            Name
            <Input name="name" required autoComplete="name" className="user-invalid:border-destructive" />
          </label>
          <label className="grid gap-1.5 text-sm">
            Email
            <Input name="email" type="email" required autoComplete="email" className="user-invalid:border-destructive" />
          </label>
          <label className="grid gap-1.5 text-sm">
            Password
            <Input name="password" type="password" required minLength={8} autoComplete="new-password" className="user-invalid:border-destructive" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-fg">
          Have an account?{" "}
          <Link to="/login" className="font-medium text-fg underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
