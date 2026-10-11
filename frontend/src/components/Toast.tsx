import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckIcon, InfoIcon } from "./icons";

type Toast = { id: number; message: string; tone: "success" | "info" | "error"; action?: { label: string; run: () => void } };
type Show = (message: string, opts?: { tone?: Toast["tone"]; action?: Toast["action"]; duration?: number }) => void;

const ToastContext = createContext<Show>(() => {});

/** Transient confirmation ("Expense deleted · Undo"). One live region, newest on top. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<Show>(
    (message, { tone = "success", action, duration } = {}) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone, action }]);
      window.setTimeout(() => dismiss(id), duration ?? (action ? 6000 : 3000));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="toast pointer-events-auto flex min-h-12 w-full max-w-sm items-center gap-3 rounded-2xl bg-hero py-2 pl-4 pr-2 text-sm text-hero-fg shadow-float"
          >
            <span className={t.tone === "error" ? "text-[oklch(0.75_0.15_25)]" : t.tone === "success" ? "text-[oklch(0.8_0.15_155)]" : "text-hero-fg/70"}>
              {t.tone === "success" ? <CheckIcon size={18} /> : <InfoIcon size={18} />}
            </span>
            <span className="min-w-0 flex-1 py-1.5">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="h-9 shrink-0 cursor-pointer rounded-full px-3 font-semibold text-primary hover:bg-hero-fg/10"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);
