import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Writing generated JSON to the clipboard, plus the "Copied" flag that follows.
 *
 * Three components had grown their own version of this - the icon card, the
 * toolbar and the conversion panel - and all three did the same four things:
 * build the JSON, `navigator.clipboard.writeText`, signal success, swallow the
 * failure. Two of them had already converged on the same literal error string.
 *
 * The failure is swallowed on purpose. `writeText` rejects for reasons the
 * user cannot act on and did not cause - an insecure origin, a document that
 * lost focus mid-gesture, a permissions policy - so the honest response is one
 * line of feedback, not an exception surfacing through a click handler.
 *
 * The reset timer is held in a ref and cleared on unmount, so a card that
 * scrolls out of the tree mid-flash cannot set state afterwards.
 */
const CLIPBOARD_ERROR = 'Could not access the clipboard.';

interface ClipboardCopyOptions {
  /** How long `copied` stays true after a successful write. */
  resetMs?: number;
  /** Runs only on success, after `copied` is set. Confetti, toasts, resets. */
  onSuccess?: () => void;
  /** Runs only on failure. Defaults to doing nothing but leaving `copied` false. */
  onError?: (message: string) => void;
}

export function useClipboardCopy(options: ClipboardCopyOptions = {}) {
  const [copied, setCopied] = useState(false);

  // Callers pass inline arrows, so the options object is a new identity on
  // every render. Reading them through a ref keeps `copy` itself stable.
  const latest = useRef(options);
  latest.current = options;

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /**
   * `text` may be a thunk so an expensive serialisation is only paid for when
   * the copy is actually attempted.
   */
  const copy = useCallback(async (text: string | (() => string)): Promise<boolean> => {
    const { resetMs = 1600, onSuccess, onError } = latest.current;

    try {
      await navigator.clipboard.writeText(typeof text === 'function' ? text() : text);
    } catch {
      setCopied(false);
      onError?.(CLIPBOARD_ERROR);
      return false;
    }

    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), resetMs);

    onSuccess?.();
    return true;
  }, []);

  return { copied, copy };
}
