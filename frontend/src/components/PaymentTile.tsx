import { ClockIcon, SettleIcon } from "./icons";

/** Payment icon tile. Pending = dashed amber outline + clock (provisional, still
 *  deletable); confirmed = solid green (locked in). The outline is the signal. */
export function PaymentTile({ pending, size = 42 }: { pending: boolean; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${
        pending ? "border-2 border-dashed border-primary bg-primary-soft text-primary-soft-fg" : "bg-positive-soft text-positive"
      }`}
      style={{ width: size, height: size, borderRadius: size * 0.31 }}
    >
      {pending ? <ClockIcon size={size * 0.46} /> : <SettleIcon size={size * 0.48} />}
    </span>
  );
}
