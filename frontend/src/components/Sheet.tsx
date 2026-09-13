import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { XIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Slide-over panel built on the native <dialog> element. */
export function Sheet({ open, onClose, title, children }: Props) {
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
        if (e.target === ref.current) ref.current.close();
      }}
      className="fixed inset-0 m-0 ml-auto h-dvh max-h-none w-[min(26rem,100vw)] bg-card p-0 text-fg shadow-2xl backdrop:bg-black/50 open:animate-[slide-in_200ms_ease-out]"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="ghost" aria-label="Close" onClick={() => ref.current?.close()}>
          <XIcon size={18} />
        </Button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
