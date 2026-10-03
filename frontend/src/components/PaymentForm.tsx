import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteUpiQr, updateMe, uploadUpiQr, upiQrUrl, type User } from "../api";
import { Button } from "./Button";
import { Input } from "./Input";
import { isValidVpa } from "../upi";

/** Editable UPI details (VPA + optional QR image). Reused in Settings, the
 *  account-menu dialog, and the self member profile. */
export function PaymentForm({ me }: { me: User }) {
  const queryClient = useQueryClient();
  const [vpa, setVpa] = useState(me.upi_id ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const invalid = vpa.trim().length > 0 && !isValidVpa(vpa.trim());

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["me"] });
  const fail = (e: unknown) => {
    setStatus("");
    setError(e instanceof Error ? e.message : "Something went wrong");
  };

  const save = useMutation({
    mutationFn: () => updateMe({ upi_id: vpa.trim() || null }),
    onSuccess: () => {
      refresh();
      setError("");
      setStatus("UPI ID saved");
    },
    onError: fail,
  });

  const clear = useMutation({
    mutationFn: () => updateMe({ upi_id: null }),
    onSuccess: () => {
      refresh();
      setVpa("");
      setError("");
      setStatus("UPI ID cleared");
    },
    onError: fail,
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadUpiQr(file),
    onSuccess: () => {
      refresh();
      setError("");
      setStatus("QR uploaded");
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => deleteUpiQr(),
    onSuccess: () => {
      refresh();
      setError("");
      setStatus("QR removed");
    },
    onError: fail,
  });

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-fg">
        Add your UPI ID and people can pay you with a QR that has the amount pre-filled — no typing.
        Don&apos;t know your UPI ID? Upload your UPI QR image instead.
      </p>

      <div className="grid gap-2 rounded-card border border-border bg-card p-4">
        <label className="grid gap-1.5 text-sm">
          UPI ID
          <Input
            value={vpa}
            onChange={(e) => setVpa(e.target.value)}
            placeholder="name@bank"
            autoComplete="off"
          />
        </label>
        {invalid && (
          <p className="text-xs text-destructive">Enter a valid UPI ID like name@bank</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={invalid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {me.upi_id && (
            <Button variant="secondary" disabled={clear.isPending} onClick={() => clear.mutate()}>
              {clear.isPending ? "Clearing…" : "Clear"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 rounded-card border border-border bg-card p-4">
        <p className="text-sm font-medium">UPI QR image</p>
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf"
          disabled={upload.isPending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
          className="text-sm text-muted-fg file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm file:text-fg"
        />
        {me.has_upi_qr && (
          <div className="grid gap-2">
            <img
              src={upiQrUrl(me.id)}
              alt="Your UPI QR"
              className="max-h-64 max-w-full rounded-card border border-border object-contain"
            />
            <Button variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Removing…" : "Remove QR"}
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : status ? (
        <p className="text-sm text-muted-fg">{status}</p>
      ) : null}
    </div>
  );
}
