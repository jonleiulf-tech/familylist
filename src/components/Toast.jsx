export function Toast({ toast, onUndo, onDismiss }) {
  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.canUndo
        ? <button type="button" className="toast-action" onClick={onUndo}>Angre</button>
        : <button type="button" className="toast-action" onClick={onDismiss}>Lukk</button>}
    </div>
  );
}
