import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, X } from 'lucide-react';

/**
 * The transient confirmation line, and the context that lets anything under
 * the icon library raise one.
 *
 * `onToast` used to be threaded from `IconsPage` through `IconsToolbar` and
 * `IconGrid` and into `IconCard`, appearing in three component interfaces
 * purely to be passed along. None of those components have anything to say
 * about how a toast is shown, so the channel is ambient instead.
 */
interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
}

/**
 * Replaces the blocking `alert()` the copy action used to fire.
 *
 * A native modal in a dark glass UI is jarring, it blocks the page until
 * dismissed, and it fires on the happy path - punishing the action the whole
 * product exists to make easy.
 */
export function Toast({ message, onDismiss, durationMs = 4000 }: ToastProps) {
  /*
   * The dismiss callback is read through a ref, not depended on.
   *
   * It used to sit in the dependency array while the call site passed an
   * inline arrow, so every re-render of the page above - and the page
   * re-renders on every option change - tore down the timer and armed a fresh
   * one. Dragging a slider therefore kept a toast on screen indefinitely,
   * because the four seconds never got a chance to elapse. Only `message` and
   * `durationMs` describe *which* timer this is; the callback does not.
   */
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => dismiss.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <Check size={16} className="toast-icon" aria-hidden="true" />
      <span>{message}</span>
      <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Identity-stable, so a component that lists `useToast()` in a dependency
 * array does not re-run on every toast.
 */
const ToastContext = createContext<(message: string) => void>(() => {});

export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}

/**
 * Owns the current message and renders the toast itself.
 *
 * Mounted by `IconsPage` rather than by the app shell: the library is the only
 * part of the site that raises toasts, and a provider at the root would put a
 * piece of the icon library's plumbing in everyone else's tree.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const dismiss = useCallback(() => setMessage(null), []);

  return (
    <ToastContext.Provider value={setMessage}>
      {children}
      <Toast message={message} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
