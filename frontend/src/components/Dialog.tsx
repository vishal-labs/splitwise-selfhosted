import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { XIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Pinned below the scrolling body (primary actions). */
  footer?: ReactNode;
  /** Desktop width, e.g. "32rem". Phones always get a full-width bottom sheet. */
  width?: string;
  /** Classes for the content wrapper; replaces the default padding. */
  bodyClassName?: string;
  /** Hide the title row (custom headers). The title stays as the accessible name. */
  bare?: boolean;
};

/** Modal on the native <dialog> (focus trap + Escape for free). Centered card on
 *  desktop, bottom sheet with a grab handle on phones (see dialog.sheet in index.css). */
export function Dialog({ open, onClose, title, children, footer, width, bodyClassName, bare }: Props) {
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
      aria-label={typeof title === "string" ? title : undefined}
      onClick={(e) => {
        // light dismiss: click landed on the backdrop (the dialog element itself)
        if (e.target === ref.current) ref.current.close();
      }}
      style={width ? ({ "--sheet-w": width } as React.CSSProperties) : undefined}
      className="sheet m-auto flex-col overflow-hidden rounded-[1.25rem] bg-card p-0 text-fg shadow-sheet open:flex"
    >
      <div className="sheet-handle shrink-0" aria-hidden="true" />
      {!bare && (
        <div className="flex shrink-0 items-center justify-between gap-2 py-3 pl-5 pr-3 max-sm:pl-4">
          <h2 className="min-w-0 truncate text-[1.0625rem] font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => ref.current?.close()} className="text-muted-fg">
            <XIcon size={20} />
          </Button>
        </div>
      )}
      <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName ?? "px-5 pb-5 max-sm:px-4"}`}>{children}</div>
      {footer && (
        <div className="sheet-footer shrink-0 border-t border-border bg-card px-5 py-3 max-sm:px-4">{footer}</div>
      )}
    </dialog>
  );
}
