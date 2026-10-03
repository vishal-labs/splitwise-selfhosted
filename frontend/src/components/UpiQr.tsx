import { QRCodeSVG } from "qrcode.react";

/** UPI QR on a clean white card (fixed padding = quiet zone). */
export default function UpiQr({ value, caption }: { value: string; caption?: string }) {
  return (
    <div className="grid justify-items-center gap-2">
      <div className="rounded-xl bg-white p-3">
        <QRCodeSVG
          value={value}
          size={200}
          level="M"
          fgColor="#1a1a1a"
          bgColor="#ffffff"
          className="h-auto max-w-full"
        />
      </div>
      {caption && <p className="max-w-full truncate text-xs text-muted-fg">{caption}</p>}
    </div>
  );
}
