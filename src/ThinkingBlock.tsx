import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Orbit } from 'lucide-react';
import { t } from './i18n';
import MessageMarkdown from './MessageMarkdown';

export default function ThinkingBlock({ reasoning, active, latest, scroll, follow }: {
  reasoning: string; active: boolean; latest: boolean;
  scroll: RefObject<HTMLDivElement | null>; follow: RefObject<boolean>;
}) {
  const [open, setOpen] = useState(false), [sticky, setSticky] = useState<{top:number;left:number} | null>(null);
  const header = useRef<HTMLButtonElement>(null), content = useRef<HTMLDivElement>(null), tail = useRef<HTMLDivElement>(null);
  const restore = useRef(false), watching = useRef(false), regionId = useId();
  const toggle = () => {
    follow.current = false;
    watching.current = false;
    if (open) restore.current = true;
    setOpen(value => !value);
  };
  useLayoutEffect(() => {
    if (tail.current) tail.current.scrollTop = tail.current.scrollHeight;
    const area = scroll.current;
    if (open && active && watching.current && area && content.current) {
      area.scrollTop += content.current.getBoundingClientRect().bottom - area.getBoundingClientRect().bottom + 12;
    }
  }, [reasoning, open, active, scroll]);
  useLayoutEffect(() => {
    if (!open && restore.current && scroll.current && header.current) {
      restore.current = false;
      scroll.current.scrollTop += header.current.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top - 10;
      header.current.focus({preventScroll:true});
    }
  }, [open, scroll]);
  useEffect(() => {
    const area = scroll.current;
    if (!open || !area) { setSticky(null); return; }
    let frame = 0;
    const measure = () => {
      const heading = header.current?.getBoundingClientRect(), body = content.current?.getBoundingClientRect(), box = area.getBoundingClientRect();
      if (!heading || !body) return;
      const viewport = window.visualViewport;
      const top = Math.max(box.top, viewport?.offsetTop || 0), bottom = Math.min(box.bottom, (viewport?.offsetTop || 0) + (viewport?.height || innerHeight));
      const visible = latest && heading.bottom < top && body.bottom > top + 52 && body.top < bottom;
      setSticky(visible ? {top:top + 8,left:Math.max(box.left + 12, Math.min(body.left, box.right - 190))} : null);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const onScroll = () => {
      const body = content.current?.getBoundingClientRect(), box = area.getBoundingClientRect();
      if (body) watching.current = body.bottom >= box.top && body.bottom <= box.bottom + 80;
      schedule();
    };
    const observer = new ResizeObserver(schedule);
    if (content.current) observer.observe(content.current);
    observer.observe(area);
    measure(); area.addEventListener('scroll', onScroll, {passive:true}); window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); area.removeEventListener('scroll', onScroll); window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [open, latest, scroll]);
  return <div className={`thinking-block reasoning-block${active ? ' is-thinking' : ''}${open ? ' is-open' : ''}`}>
    <button ref={header} type="button" className="thinking-toggle" aria-expanded={open} aria-controls={regionId} onClick={toggle}>
      <Orbit size={16} className="thinking-icon" aria-hidden="true"/>
      <span>{active ? t('Размышляет…') : t('Размышления')}</span>
      <ChevronDown size={14} className={open ? 'thinking-chevron open' : 'thinking-chevron'} aria-hidden="true"/>
    </button>
    <div className={`thinking-tail-wrap${active && !open ? ' visible' : ''}`} aria-hidden="true"><div>
      <div className="thinking-tail" ref={tail}>{reasoning.slice(-2000)}</div>
    </div></div>
    <div id={regionId} className={`thinking-reveal${open ? ' open' : ''}`} inert={!open} aria-hidden={!open}>
      <div><div ref={content} className="thinking-content">{open && <MessageMarkdown content={reasoning} streaming={active}/>}</div></div>
    </div>
    {sticky && open && latest && createPortal(<button type="button" className="thinking-collapse" style={sticky} aria-controls={regionId} aria-expanded="true" onClick={toggle}><ChevronUp size={15} aria-hidden="true"/>{t('Свернуть размышления')}</button>, document.body)}
  </div>;
}
