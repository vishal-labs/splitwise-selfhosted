import type { Debt, GroupDetail, Member, User } from "../../api";
import { reminderText, shareText } from "../../balance";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { BellIcon, CheckIcon, InfoIcon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { firstName, formatMinor } from "../../format";
import { memberName } from "./Feed";

/** Net position per member (positive = gets back), from the group's debt list. */
export function memberNets(debts: Debt[]): Map<number, number> {
  const nets = new Map<number, number>();
  for (const d of debts) {
    nets.set(d.to, (nets.get(d.to) ?? 0) + d.amount);
    nets.set(d.from, (nets.get(d.from) ?? 0) - d.amount);
  }
  return nets;
}

export function useRemind(me: User, groupName: string) {
  const toast = useToast();
  return async (to: { name: string }, amount: number, currency: string) => {
    const how = await shareText(reminderText(me, to, amount, currency, groupName));
    if (how !== "cancelled") toast(`Reminder ready for ${firstName(to.name)}`);
  };
}

/** Who owes whom, plus a per-member summary (Splitwise's "Balances" screen). */
export function Balances({
  group,
  me,
  debts,
  onSettle,
  onMember,
}: {
  group: GroupDetail;
  me: User;
  debts: Debt[];
  onSettle: (otherId?: number) => void;
  /** Tap a member: shows their UPI details. */
  onMember: (m: Member) => void;
}) {
  const remind = useRemind(me, group.name);
  const nets = memberNets(debts);
  // object position: "owes you", not "owes You"
  const name = (id: number) => (id === me.id ? "you" : memberName(group.members, id));

  if (debts.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-10 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-positive-soft text-positive">
          <CheckIcon size={24} />
        </span>
        <h3 className="font-semibold">All settled up</h3>
        <p className="max-w-xs text-sm text-muted-fg">Nobody owes anything in this group.</p>
      </div>
    );

  return (
    <div className="grid gap-5">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {group.members.map((m) => {
          const net = nets.get(m.id) ?? 0;
          const lines = debts.filter((d) => d.from === m.id || d.to === m.id);
          return (
            <li key={m.id} className="px-3.5 py-3">
              <button type="button" onClick={() => onMember(m)} className="flex w-full cursor-pointer items-center gap-3 text-left">
                <Avatar name={m.name} size={36} pending={m.pending} />
                <p className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m.id === me.id ? "You" : m.name}</span>
                  <span className={`block text-sm ${net > 0 ? "text-positive" : net < 0 ? "text-negative" : "text-muted-fg"}`}>
                    {net > 0
                      ? `${m.id === me.id ? "get" : "gets"} back ${formatMinor(net, group.currency)}`
                      : net < 0
                        ? `${m.id === me.id ? "owe" : "owes"} ${formatMinor(-net, group.currency)} in total`
                        : "settled up"}
                  </span>
                </p>
              </button>
              {lines.length > 0 && (
                <ul className="mt-2 grid gap-1 pl-12">
                  {lines.map((d) => {
                    const theyOweMe = d.to === me.id && d.from === m.id;
                    const iOweThem = d.from === me.id && d.to === m.id;
                    return (
                      <li key={`${d.from}-${d.to}`} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-muted-fg">
                          {d.from === m.id ? (
                            <>
                              {m.id === me.id ? "You owe" : "owes"} <span className="font-medium text-fg">{name(d.to)}</span>
                            </>
                          ) : (
                            <>
                              <span className="font-medium text-fg">{d.from === me.id ? "You" : name(d.from)}</span> {d.from === me.id ? "owe" : "owes"}{" "}
                              {m.id === me.id ? "you" : firstName(m.name)}
                            </>
                          )}
                        </span>
                        <span className="tabular font-medium">{formatMinor(d.amount, group.currency)}</span>
                        {theyOweMe && (
                          <button
                            type="button"
                            onClick={() => void remind(m, d.amount, group.currency)}
                            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-primary-soft px-2.5 text-xs font-semibold text-primary-soft-fg"
                          >
                            <BellIcon size={13} /> Remind
                          </button>
                        )}
                        {iOweThem && (
                          <button
                            type="button"
                            onClick={() => onSettle(m.id)}
                            className="inline-flex h-8 cursor-pointer items-center rounded-full bg-hero px-3 text-xs font-semibold text-hero-fg"
                          >
                            Pay
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="flex gap-2 px-1 text-xs text-muted-fg">
        <InfoIcon size={14} className="mt-px shrink-0" />
        {group.simplify_debts
          ? "Debts are simplified: payments are rerouted so the group settles in as few transfers as possible. Change this in group settings."
          : "Debts are shown person-to-person, exactly as incurred. Turn on “Simplify debts” in group settings for fewer transfers."}
      </p>
      <div className="flex justify-center md:hidden">
        <Button variant="secondary" onClick={() => onSettle()}>
          Record a payment
        </Button>
      </div>
    </div>
  );
}
