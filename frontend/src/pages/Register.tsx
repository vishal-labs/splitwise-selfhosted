import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, ApiError } from "../api";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { Field, FormError, Input } from "../components/Input";
import { useMe } from "../App";

export default function Register() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const register = useMutation({
    mutationFn: (body: { email: string; name: string; password: string }) => api("/users/register", { body }),
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
      name: (data.get("name") as string).trim(),
      password: data.get("password") as string,
    });
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="If a friend already added you, use the same email — your groups will be waiting."
      footer={
        <>
          Have an account?{" "}
          <Link to="/login" className="font-semibold text-fg underline decoration-primary decoration-2 underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="Your name">
          <Input name="name" required autoComplete="name" placeholder="Priya Sharma" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" disabled={register.isPending} className="mt-1 w-full">
          {register.isPending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
