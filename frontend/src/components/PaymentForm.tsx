import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteUpiQr, updateMe, uploadUpiQr, upiQrUrl, type User } from "../api";
import { Button } from "./Button";
import { QrIcon } from "./icons";
import { FormError, Input } from "./Input";
import { isValidVpa } from "../upi";

/** Editable UPI details (VPA + optional QR image). Reused in Settings, the
 *  home-screen nudge, and the self member profile. */
export function PaymentForm({ me }: { me: User }) {
  const queryClient = useQueryClient();
  const [vpa, setVpa] = useState(me.upi_id ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const invalid = vpa.trim().length > 0 && !isValidVpa(vpa.trim());

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["me"] });
  const done = (msg: string) => {
    refresh();
    setError("");
    setStatus(msg);
  };
  const fail = (e: unknown) => {
    setStatus("");
    setError(e instanceof Error ? e.message : "Something went wrong");
  };

  const save = useMutation({ mutationFn: () => updateMe({ upi_id: vpa.trim() || null }), onSuccess: () => done("UPI ID saved"), onError: fail });
  const clear = useMutation({
    mutationFn: () => updateMe({ upi_id: null }),
    onSuccess: () => {
      setVpa("");
      done("UPI ID cleared");
    },
    onError: fail,
  });
  const upload = useMutation({ mutationFn: (file: File) => uploadUpiQr(file), onSuccess: () => done("QR uploaded"), onError: fail });
  const remove = useMutation({ mutationFn: () => deleteUpiQr(), onSuccess: () => done("QR removed"), onError: fail });

  return (
    <div className="grid gap-5 pt-1">
      <p className="text-sm text-muted-fg">
        With a UPI ID, friends get a pay link with the exact amount pre-filled — no typing. Don&apos;t know yours? Upload your UPI QR image instead.
      </p>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) save.mutate();
        }}
      >
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">UPI ID</span>
          <Input value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@okaxis" autoComplete="off" autoCapitalize="off" spellCheck={false} />
        </label>
        {invalid && <p className="text-xs text-destructive">Enter a valid UPI ID like name@bank</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={invalid || save.isPending || vpa.trim() === (me.upi_id ?? "")} className="flex-1">
            {save.isPending ? "Saving…" : "Save UPI ID"}
          </Button>
          {me.upi_id && (
            <Button variant="secondary" disabled={clear.isPending} onClick={() => clear.mutate()}>
              Clear
            </Button>
          )}
        </div>
      </form>

      <div className="grid gap-3 rounded-2xl bg-muted p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <QrIcon size={16} /> UPI QR image
        </p>
        {me.has_upi_qr && (
          <img src={upiQrUrl(me.id)} alt="Your UPI QR" className="mx-auto max-h-56 max-w-full rounded-xl border border-border bg-white object-contain" />
        )}
        <div className="flex flex-wrap gap-2">
          <label className={`chipless ${upload.isPending ? "opacity-50" : ""}`}>
            {upload.isPending ? "Uploading…" : me.has_upi_qr ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              disabled={upload.isPending}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
          </label>
          {me.has_upi_qr && (
            <button type="button" className="chipless text-destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Remove
            </button>
          )}
        </div>
      </div>

      <FormError>{error}</FormError>
      {!error && status && (
        <p role="status" className="text-sm font-medium text-positive">
          {status} ✓
        </p>
      )}
    </div>
  );
}
