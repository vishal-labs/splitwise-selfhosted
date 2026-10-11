import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, ApiError } from "../api";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { Field, FormError, Input } from "../components/Input";
import { useMe } from "../App";

export default function Login() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) => api("/users/login", { body }),
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
    login.mutate({ email: data.get("email") as string, password: data.get("password") as string });
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see who owes what."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-semibold text-fg underline decoration-primary decoration-2 underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" disabled={login.isPending} className="mt-1 w-full">
          {login.isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
