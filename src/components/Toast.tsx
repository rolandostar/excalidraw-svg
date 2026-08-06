import { useEffect } from 'react';
import { Check, X } from 'lucide-react';

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
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

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
