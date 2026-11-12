import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from './i18n';

let modalLocks = 0, previousOverflow = '', previousPadding = '';
const layers: HTMLElement[] = [];

export function Modal({ title, children, onClose, wide = false, className = '', viewportFit = false, closing = false, returnFocus }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string; viewportFit?: boolean; closing?: boolean; returnFocus?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null), backdrop = useRef<HTMLDivElement>(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    if (!viewportFit) return;
    const place = () => {
      const node = backdrop.current, viewport = window.visualViewport;
      if (!node) return;
      Object.assign(node.style, { top: `${viewport?.offsetTop || 0}px`, left: `${viewport?.offsetLeft || 0}px`, width: `${viewport?.width || innerWidth}px`, height: `${viewport?.height || innerHeight}px` });
    };
    place();
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [viewportFit]);
  useEffect(() => {
    const node = ref.current!;
    const previous = returnFocus || document.activeElement as HTMLElement | null;
    const parent = layers.at(-1);
    if (parent) parent.inert = true;
    layers.push(node);
    if (modalLocks++ === 0) {
      previousOverflow = document.body.style.overflow; previousPadding = document.body.style.paddingRight;
      const gutter = innerWidth - document.documentElement.clientWidth;
      if (gutter) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`;
      document.body.style.overflow = 'hidden';
    }
    node.focus({ preventScroll: true });
    const handle = (event: KeyboardEvent) => {
      if (layers.at(-1) !== node || node.closest('[inert]')) return;
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')).filter(el => !el.closest('[inert]') && el.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); node.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node || !node.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handle, true);
    return () => {
      document.removeEventListener('keydown', handle, true);
      layers.splice(layers.indexOf(node), 1);
      const top = layers.at(-1); if (top) top.inert = false;
      if (--modalLocks === 0) { document.body.style.overflow = previousOverflow; document.body.style.paddingRight = previousPadding; }
      if (previous?.isConnected && (document.activeElement === document.body || node.contains(document.activeElement))) previous.focus({ preventScroll: true });
    };
  }, []);
  return <div ref={backdrop} className={`modal-backdrop${viewportFit ? ' editor-backdrop' : ''}${closing ? ' is-closing' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} inert={closing}>
      <header><h2>{title}</h2><button type="button" className="icon-button" aria-label={t('Закрыть')} onClick={onClose}><X size={21}/></button></header>{children}
    </div>
  </div>;
}
