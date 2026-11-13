import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./ui";

const Ctx = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setToast({ text, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {/* the live region stays mounted so screen readers announce each new message */}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className="toast">
            <span className="toast-dot" aria-hidden="true">
              <Icon name="check" />
            </span>
            {toast.text}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
