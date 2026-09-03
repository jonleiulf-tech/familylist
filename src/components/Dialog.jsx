import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Det som kan ta fokus inne i panelet. Lukkekrysset er unntatt fra
// START-fokuset (det skal ikke være det første man treffer), men er med i
// Tab-syklusen.
const FOCUSABLE = 'input:not([type="hidden"]), select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';
const focusablesIn = (panel) => [...panel.querySelectorAll(FOCUSABLE)]
  .filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true');

/**
 * Alle dialoger: backdrop + panel, klikk utenfor lukker, Esc lukker.
 *
 * Fokus flyttes inn i panelet ved åpning (første felt eller knapp som ikke
 * er lukkekrysset, ellers panelet selv), Tab holder seg inne i panelet, og
 * fokus går tilbake til det som åpnet dialogen når den lukkes.
 */
export function Dialog({ title, subtitle, onClose, children, footer }) {
  const panelRef = useRef(null);

  // Fokus inn ved åpning — og tilbake til åpneren ved avmontering.
  useEffect(() => {
    const opener = document.activeElement;
    const panel = panelRef.current;
    if (panel) {
      const first = focusablesIn(panel).find((el) => !el.hasAttribute('data-dialog-close'));
      (first ?? panel).focus({ preventScroll: true });
    }
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      // Tab-fellen: fra siste element går man til det første, og omvendt.
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusablesIn(panel);
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = panel.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // Hindre at siden bak scroller mens dialogen er åpen
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div ref={panelRef} className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="dialog-header">
          <div>
            <div className="dialog-title">{title}</div>
            {subtitle && <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Lukk" data-dialog-close="">
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
