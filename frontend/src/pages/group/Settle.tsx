import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createSettlement,
  invalidateGroup,
  settlementProofUrl,
  uploadSettlementProof,
  upiQrUrl,
  type Debt,
  type GroupDetail,
  type Member,
  type Settlement,
  type User,
} from "../../api";
import { Attachment } from "../../components/Attachment";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CopyIcon, PaperclipIcon } from "../../components/icons";
import { FormError } from "../../components/Input";
import { PaymentForm } from "../../components/PaymentForm";
import { Tabs } from "../../components/Tabs";
import { useToast } from "../../components/Toast";
import UpiQr from "../../components/UpiQr";
import { currencySymbol, dayLabel, firstName, formatMinor, parseMinor } from "../../format";
import { buildUpiUri, isValidVpa } from "../../upi";
import { memberName } from "./Feed";

function useCopy() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: async (text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
  };
}

/** Big centered amount field with the currency symbol. */
function AmountInput({ value, onChange, currency }: { value: string; onChange: (v: string) => void; currency: string }) {
  return (
    <label className="flex items-baseline justify-center gap-1 rounded-2xl bg-muted px-4 py-4">
      <span className="text-2xl font-semibold text-muted-fg">{currencySymbol(currency)}</span>
      <input
        type="number"
        step="0.01"
        min="0.01"
        inputMode="decimal"
        autoComplete="off"
        aria-label="Amount"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular w-full max-w-[12rem] border-0 bg-transparent text-center text-4xl font-bold tracking-tight placeholder:text-muted-fg/50 focus-visible:outline-none"
      />
    </label>
  );
}

/** UPI pay block: deep link on phones (opens GPay/PhonePe/Paytm), QR + copy on desktop. */
function PayWithUpi({ payee, amountMinor, note }: { payee: Member; amountMinor: number; note: string }) {
  const { copied, copy } = useCopy();
  const vpa = payee.upi_id && isValidVpa(payee.upi_id) ? payee.upi_id : null;
  if (!vpa && !payee.has_upi_qr) return null;
  const uri = vpa ? buildUpiUri({ vpa, payeeName: payee.name, amountMinor, note }) : "";
  return (
    <div className="grid gap-3 rounded-2xl border border-border p-4">
      <p className="text-sm font-semibold">Pay {firstName(payee.name)} via UPI</p>
      {vpa ? (
        <>
          <a href={uri} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-hero font-semibold text-hero-fg sm:hidden">
            Open UPI app · {formatMinor(amountMinor, "INR")}
          </a>
          <div className="hidden justify-items-center gap-3 sm:grid">
            <UpiQr value={uri} caption={`Scan to pay ${payee.name}`} />
          </div>
          <button
            type="button"
            onClick={() => void copy(vpa)}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-medium text-muted-fg hover:bg-muted"
          >
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            {copied ? "Copied" : vpa}
          </button>
        </>
      ) : (
        <img src={upiQrUrl(payee.id)} alt={`${payee.name} UPI QR`} className="mx-auto max-h-64 max-w-full rounded-xl border border-border object-contain" />
      )}
    </div>
  );
}

function ProofPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className={`chipless w-fit max-w-full ${file ? "is-on" : ""}`}>
      <PaperclipIcon size={15} />
      <span className="max-w-[14rem] truncate">{file ? file.name : "Attach payment proof"}</span>
      <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}

/** Record a payment between you and one member — either direction. */
export function SettleUpDialog({ group, me, debts, initialTo, onClose }: { group: GroupDetail; me: User; debts: Debt[]; initialTo?: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const others = group.members.filter((m) => m.id !== me.id);
  const iOwe = debts.filter((d) => d.from === me.id);
  const owedToMe = debts.filter((d) => d.to === me.id);
  // default direction: pay if you owe anyone (or the preselected person), else receive
  const [direction, setDirection] = useState<"pay" | "receive">(() =>
    initialTo !== undefined ? (owedToMe.some((d) => d.from === initialTo) && !iOwe.some((d) => d.to === initialTo) ? "receive" : "pay") : iOwe.length || !owedToMe.length ? "pay" : "receive",
  );
  const relevant = direction === "pay" ? iOwe.map((d) => ({ id: d.to, amount: d.amount })) : owedToMe.map((d) => ({ id: d.from, amount: d.amount }));
  const [otherId, setOtherId] = useState<number | null>(initialTo ?? null);
  const selectedId = otherId ?? relevant[0]?.id ?? others[0]?.id ?? null;
  const other = group.members.find((m) => m.id === selectedId);
  const suggested = relevant.find((r) => r.id === selectedId)?.amount;
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const amount = amountOverride ?? (suggested ? (suggested / 100).toFixed(2) : "");
  const amountMinor = parseMinor(amount);
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pendingProof, setPendingProof] = useState<number | null>(null);
  const note = `Splitwise: ${group.name}`.slice(0, 50);

  const settle = useMutation({
    mutationFn: async () => {
      const body =
        direction === "pay"
          ? { payer_id: me.id, payee_id: selectedId!, amount_minor: amountMinor, currency: group.currency }
          : { payer_id: selectedId!, payee_id: me.id, amount_minor: amountMinor, currency: group.currency };
      const settlement = await createSettlement(group.id, body);
      // settlement exists the moment create resolves — proof is a separate,
      // non-blocking step so a failed upload can't cause a double-record
      let proofFailed = false;
      if (proof) {
        try {
          await uploadSettlementProof(settlement.id, proof);
        } catch {
          proofFailed = true;
        }
      }
      return { settlement, proofFailed };
    },
    onSuccess: ({ settlement, proofFailed }) => {
      invalidateGroup(queryClient, group.id);
      if (proofFailed) {
        setError("Payment recorded, but the proof upload failed. Try attaching it again.");
        setPendingProof(settlement.id);
        setProof(null);
      } else {
        toast(`Recorded ${formatMinor(amountMinor, group.currency)} payment`);
        onClose();
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  const retryProof = useMutation({
    mutationFn: () => uploadSettlementProof(pendingProof!, proof!),
    onSuccess: () => {
      invalidateGroup(queryClient, group.id);
      toast("Proof attached");
      onClose();
    },
    onError: (e) => setError(`Proof upload failed: ${e instanceof Error ? e.message : "unknown error"}`),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Settle up"
      footer={
        pendingProof !== null ? (
          <Button size="lg" className="w-full" disabled={!proof || retryProof.isPending} onClick={() => retryProof.mutate()}>
            {retryProof.isPending ? "Uploading…" : "Attach proof"}
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full"
            disabled={settle.isPending || !(amountMinor > 0) || selectedId == null}
            onClick={() => {
              setError("");
              settle.mutate();
            }}
          >
            {settle.isPending ? "Recording…" : `Record ${amountMinor > 0 ? formatMinor(amountMinor, group.currency) : "payment"}`}
          </Button>
        )
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-1">
        <div className="flex justify-center">
          <Tabs
            tabs={[
              { id: "pay", label: "I paid" },
              { id: "receive", label: "I received" },
            ]}
            value={direction}
            onChange={(d) => {
              setDirection(d as "pay" | "receive");
              setOtherId(null);
              setAmountOverride(null);
            }}
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          <Avatar name={direction === "pay" ? me.name : (other?.name ?? "?")} size={48} />
          <ArrowRightIcon size={20} className="text-muted-fg" />
          <Avatar name={direction === "pay" ? (other?.name ?? "?") : me.name} size={48} />
        </div>

        <div className="scroll-x -mx-1 gap-1.5 px-1">
          {others.map((m) => {
            const owed = relevant.find((r) => r.id === m.id);
            const active = m.id === selectedId;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setOtherId(m.id);
                  setAmountOverride(null);
                }}
                className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors ${
                  active ? "border-transparent bg-hero text-hero-fg" : "border-border bg-card hover:bg-muted"
                }`}
              >
                <Avatar name={m.name} size={28} pending={m.pending} />
                <span className="text-left leading-tight">
                  <span className="block font-medium">{firstName(m.name)}</span>
                  {owed && <span className={`tabular block text-[0.6875rem] ${active ? "text-hero-fg/70" : "text-muted-fg"}`}>{formatMinor(owed.amount, group.currency)}</span>}
                </span>
              </button>
            );
          })}
        </div>

        <AmountInput value={amount} onChange={setAmountOverride} currency={group.currency} />
        <p className="-mt-2 text-center text-sm text-muted-fg">
          {direction === "pay" ? `You paid ${other?.name ?? "…"}` : `${other?.name ?? "…"} paid you`}
          {suggested ? ` · ${direction === "pay" ? "you owe" : "they owe"} ${formatMinor(suggested, group.currency)}` : " · no open balance"}
        </p>

        {direction === "pay" && other && amountMinor > 0 && group.currency === "INR" && (
          <PayWithUpi payee={other} amountMinor={amountMinor} note={note} />
        )}

        <ProofPicker file={proof} onChange={setProof} />
        <FormError>{error}</FormError>
      </div>
    </Dialog>
  );
}

/** Step-through of every debt where you're the payer, recording one payee at a
 *  time. Debts are snapshotted once at mount so a live refetch can't shift the
 *  list and make the per-index flow record against the wrong payee. */
export function SettleAllDialog({ group, me, debts, onClose }: { group: GroupDetail; me: User; debts: Debt[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [myDebts] = useState(() => debts.filter((d) => d.from === me.id));
  const [index, setIndex] = useState(0);
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  const current = myDebts[index];
  const payee = group.members.find((m) => m.id === current?.to);
  const amount = amountOverride ?? (current ? (current.amount / 100).toFixed(2) : "");
  const amountMinor = parseMinor(amount);
  const isRecorded = current ? recorded.has(current.to) : false;
  const isLast = index >= myDebts.length - 1;

  const close = () => {
    invalidateGroup(queryClient, group.id);
    if (recorded.size) toast(`Recorded ${recorded.size} payment${recorded.size === 1 ? "" : "s"}`);
    onClose();
  };

  const record = useMutation({
    mutationFn: () =>
      createSettlement(group.id, { payer_id: me.id, payee_id: current!.to, amount_minor: amountMinor, currency: group.currency }),
    onSuccess: () => {
      setRecorded((s) => new Set(s).add(current!.to));
      setError("");
      invalidateGroup(queryClient, group.id);
      if (isLast) {
        toast(`Recorded ${recorded.size + 1} payment${recorded.size ? "s" : ""}`);
        onClose();
      } else {
        setIndex(index + 1);
        setAmountOverride(null);
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function go(delta: number) {
    setIndex((i) => Math.min(Math.max(i + delta, 0), myDebts.length - 1));
    setAmountOverride(null);
    setError("");
  }

  return (
    <Dialog
      open
      onClose={close}
      title="Settle all"
      footer={
        current && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" className="h-11 w-11" disabled={index === 0} onClick={() => go(-1)} aria-label="Previous">
              <ArrowLeftIcon size={18} />
            </Button>
            {isRecorded ? (
              <Button variant="secondary" className="flex-1" onClick={() => (isLast ? close() : go(1))}>
                {isLast ? "Done" : "Next"}
              </Button>
            ) : (
              <Button className="flex-1" disabled={record.isPending || !(amountMinor > 0)} onClick={() => record.mutate()}>
                {record.isPending ? "Recording…" : isLast ? "Record & finish" : "Record & next"}
              </Button>
            )}
            <Button variant="secondary" size="icon" className="h-11 w-11" disabled={isLast} onClick={() => go(1)} aria-label="Skip">
              <ArrowRightIcon size={18} />
            </Button>
          </div>
        )
      }
    >
      {!current ? (
        <p className="py-6 text-center text-muted-fg">You don&apos;t owe anyone in this group.</p>
      ) : (
        <div key={index} className="settle-step grid gap-4 pt-1">
          <div className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${myDebts.length}`}>
            {myDebts.map((d, i) => (
              <span
                key={d.to}
                className={`h-1.5 flex-1 rounded-full ${recorded.has(d.to) ? "bg-positive" : i === index ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Avatar name={payee?.name ?? ""} size={44} />
            <div>
              <p className="font-semibold">Pay {payee?.name ?? memberName(group.members, current.to)}</p>
              <p className="text-sm text-muted-fg">
                {isRecorded ? <span className="text-positive">Recorded ✓</span> : `Step ${index + 1} of ${myDebts.length}`}
              </p>
            </div>
          </div>
          <AmountInput value={amount} onChange={setAmountOverride} currency={group.currency} />
          {payee && amountMinor > 0 && group.currency === "INR" && (
            <PayWithUpi payee={payee} amountMinor={amountMinor} note={`Splitwise: ${group.name}`.slice(0, 50)} />
          )}
          <FormError>{error}</FormError>
        </div>
      )}
    </Dialog>
  );
}

/** Payment detail: who, how much, when, and the proof if attached. */
export function PaymentDetail({ settlement, members, meId, currency, onClose }: { settlement: Settlement; members: Member[]; meId: number; currency: string; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="Payment">
      <div className="grid gap-4 pt-1">
        <div className="flex items-center justify-center gap-3 py-2">
          <Avatar name={memberName(members, settlement.payer_id)} size={48} />
          <ArrowRightIcon size={20} className="text-muted-fg" />
          <Avatar name={memberName(members, settlement.payee_id)} size={48} />
        </div>
        <p className="text-center">
          <span className="font-semibold">{memberName(members, settlement.payer_id, meId)}</span> paid{" "}
          <span className="font-semibold">{memberName(members, settlement.payee_id, meId)}</span>
        </p>
        <p className="tabular text-center text-4xl font-bold tracking-tight text-positive">{formatMinor(settlement.amount_minor, currency)}</p>
        <p className="text-center text-sm text-muted-fg">{dayLabel(settlement.date)}</p>
        {settlement.proof_path ? (
          <div className="grid gap-2 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-fg">Proof</h3>
            <Attachment url={settlementProofUrl(settlement.id)} path={settlement.proof_path} alt="Payment proof" linkLabel="Open proof (PDF)" />
          </div>
        ) : (
          <p className="rounded-2xl bg-muted px-4 py-3 text-center text-sm text-muted-fg">No proof attached</p>
        )}
      </div>
    </Dialog>
  );
}

/** Another member's UPI details (yours open the editable form). */
export function MemberProfileDialog({ member, me, groupName, onClose }: { member: Member; me: User; groupName: string; onClose: () => void }) {
  const { copied, copy } = useCopy();
  const vpa = member.upi_id && isValidVpa(member.upi_id) ? member.upi_id : null;

  if (member.id === me.id)
    return (
      <Dialog open onClose={onClose} title="Your payment details">
        <PaymentForm me={me} />
      </Dialog>
    );

  return (
    <Dialog open onClose={onClose} title={member.name}>
      <div className="grid gap-4 pt-1">
        <div className="flex items-center gap-3">
          <Avatar name={member.name} size={52} pending={member.pending} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{member.name}</p>
            <p className="truncate text-sm text-muted-fg">{member.email}</p>
            {member.pending && <p className="text-xs font-medium text-primary-soft-fg">Invited — hasn't joined yet</p>}
          </div>
        </div>
        {!vpa && !member.has_upi_qr ? (
          <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-fg">{firstName(member.name)} hasn't added UPI details yet.</p>
        ) : (
          <>
            {vpa ? (
              <UpiQr value={buildUpiUri({ vpa, payeeName: member.name, note: `Splitwise: ${groupName}` })} caption={member.name} />
            ) : (
              <img src={upiQrUrl(member.id)} alt={`${member.name} UPI QR`} className="mx-auto max-h-64 max-w-full rounded-xl border border-border object-contain" />
            )}
            {vpa && (
              <Button variant="secondary" onClick={() => void copy(vpa)}>
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                {copied ? "Copied" : vpa}
              </Button>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
