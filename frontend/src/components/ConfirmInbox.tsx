import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { confirmSettlement, deleteSettlement, invalidateGroup, usePendingSettlements, type PendingSettlement } from "../api";
import { dayLabel, firstName, formatMinor } from "../format";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { useToast } from "./Toast";

/** Payments other people recorded to you, waiting for you to confirm. Renders
 *  nothing when there are none. */
export function ConfirmInbox() {
  const { data } = usePendingSettlements();
  if (!data?.length) return null;
  return (
    <section aria-label="Payments to confirm" className="mb-6 rounded-[1.375rem] border-2 border-dashed border-primary/70 bg-primary-soft/40 p-3">
      <h2 className="px-1 pb-2 font-semibold">
        {data.length === 1 ? "1 payment to confirm" : `${data.length} payments to confirm`}
      </h2>
      <ul className="grid gap-2">
        {data.map((s) => (
          <Item key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}

function Item({ s }: { s: PendingSettlement }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const amount = formatMinor(s.amount_minor, s.group_currency);
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : "Something went wrong", { tone: "error" });
  const confirm = useMutation({
    mutationFn: () => confirmSettlement(s.id),
    onSuccess: () => {
      invalidateGroup(queryClient, s.group_id);
      toast(`Payment confirmed · ${amount} from ${firstName(s.payer_name)}`);
    },
    onError: fail,
  });
  const decline = useMutation({
    mutationFn: () => deleteSettlement(s.id),
    onSuccess: () => {
      invalidateGroup(queryClient, s.group_id);
      toast("Payment declined");
    },
    onError: fail,
  });
  const busy = confirm.isPending || decline.isPending;

  return (
    <li className="rounded-2xl bg-card p-3 shadow-card">
      <div className="flex items-center gap-3">
        <Avatar name={s.payer_name} size={40} />
        <p className="min-w-0 flex-1 text-sm">
          <span className="block">
            <span className="font-semibold">{s.payer_name}</span> says they paid you{" "}
            <span className="tabular font-semibold">{amount}</span>
          </span>
          <span className="block truncate text-muted-fg">
            <Link to={`/groups/${s.group_id}`} className="hover:underline">
              {s.group_name}
            </Link>
            {` · ${dayLabel(s.date)}`}
          </span>
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => decline.mutate()}>
          I didn't get this
        </Button>
        <Button size="sm" disabled={busy} onClick={() => confirm.mutate()}>
          Confirm received
        </Button>
      </div>
    </li>
  );
}
