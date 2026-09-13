import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Extra classes for the <dialog> element (size/layout overrides). */
  className?: string;
  /** Classes for the content wrapper; replaces the default padding. */
  bodyClassName?: string;
};

/** Modal built on the native <dialog> element (focus trap + Escape for free). */
export function Dialog({ open, onClose, title, children, className, bodyClassName }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // light dismiss: click landed on the backdrop (the dialog element itself)
        if (e.target === ref.current) ref.current.close();
      }}
      className={`m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card bg-card p-0 text-fg shadow-xl backdrop:bg-black/50 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="ghost" aria-label="Close" onClick={() => ref.current?.close()}>
          ✕
        </Button>
      </div>
      <div className={bodyClassName ?? "p-5"}>{children}</div>
    </dialog>
  );
}
