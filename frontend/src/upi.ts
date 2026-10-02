export type UpiParams = {
  vpa: string;
  payeeName: string;
  amountMinor?: number;
  note?: string;
};

const VPA_RE = /^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/;

export function isValidVpa(v: string): boolean {
  return VPA_RE.test(v);
}

export function buildUpiUri({ vpa, payeeName, amountMinor, note }: UpiParams): string {
  const params = [
    `pa=${encodeURIComponent(vpa)}`,
    `pn=${encodeURIComponent(payeeName)}`,
    "cu=INR",
  ];
  if (amountMinor && amountMinor > 0) params.push(`am=${(amountMinor / 100).toFixed(2)}`);
  if (note) params.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${params.join("&")}`;
}
