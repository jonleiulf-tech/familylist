import { useCallback, useRef, useState } from 'react';

/**
 * Toast nederst. Der handlingen er destruktiv sendes en angre-funksjon med,
 * og knappen «Angre» vises.
 */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const undoRef = useRef(null);

  const show = useCallback((message, onUndo = null, ms = 6000) => {
    if (timer.current) clearTimeout(timer.current);
    undoRef.current = onUndo;
    setToast({ message, canUndo: Boolean(onUndo) });
    timer.current = setTimeout(() => { setToast(null); undoRef.current = null; }, ms);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
    undoRef.current = null;
  }, []);

  const undo = useCallback(() => {
    const fn = undoRef.current;
    dismiss();
    if (fn) fn();
  }, [dismiss]);

  return { toast, show, undo, dismiss };
}
