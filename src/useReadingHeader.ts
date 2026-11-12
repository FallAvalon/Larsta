import { useEffect, useState, type RefObject } from 'react';

// Only deliberate reading gestures can tuck the header away. Layout changes,
// pagination, focus scrolling and the phone keyboard are not reading gestures.
export function useReadingHeader(list: RefObject<HTMLDivElement | null>, header: RefObject<HTMLDivElement | null>, pinned: boolean) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const area = list.current, panel = header.current;
    if (!area || !panel) return;
    const mobile = matchMedia('(max-width:760px), (max-width:1000px) and (pointer:coarse)');
    let last = area.scrollTop, travel = 0, direction = 0, intentUntil = 0, settlingUntil = 0, tucked = false;
    setHidden(false);
    const typing = () => !!document.activeElement?.closest('input, textarea, select, [contenteditable=true]');
    const locked = () => pinned || !mobile.matches || typing()
      || (panel.contains(document.activeElement) && !!document.activeElement?.matches(':focus-visible'));
    const reset = () => { last = area.scrollTop; travel = 0; direction = 0; intentUntil = 0; };
    const reveal = () => { tucked = false; setHidden(false); settlingUntil = performance.now() + 260; reset(); };
    const intent = () => { if (!locked()) intentUntil = performance.now() + 1200; };
    const key = (event: KeyboardEvent) => {
      if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) intent();
    };
    const scroll = () => {
      const now = performance.now(), y = Math.max(0, area.scrollTop), delta = y - last;
      last = y;
      if (locked()) { if (tucked) reveal(); return; }
      if (now < settlingUntil || now > intentUntil) { travel = 0; return; }
      if (y < 12) { if (tucked) reveal(); return; }
      if (Math.abs(delta) < 1) return;
      const nextDirection = Math.sign(delta);
      travel = nextDirection === direction ? travel + Math.abs(delta) : Math.abs(delta);
      direction = nextDirection;
      // A short list must still be scrollable after the panel disappears,
      // otherwise there would be no upward scroll available to reveal it.
      const roomToHide = area.scrollHeight - area.clientHeight > panel.getBoundingClientRect().height + 80;
      if ((!tucked && roomToHide && direction > 0 && travel >= 40 && y > 72) || (tucked && direction < 0 && travel >= 16)) {
        tucked = !tucked; setHidden(tucked); settlingUntil = now + 260; travel = 0;
      }
    };
    const focus = () => { if (panel.contains(document.activeElement) || typing()) reveal(); };
    area.addEventListener('scroll', scroll, {passive:true});
    area.addEventListener('wheel', intent, {passive:true});
    area.addEventListener('touchmove', intent, {passive:true});
    area.addEventListener('keydown', key);
    document.addEventListener('focusin', focus);
    window.addEventListener('resize', reveal);
    window.visualViewport?.addEventListener('resize', reveal);
    mobile.addEventListener('change', reveal);
    return () => {
      area.removeEventListener('scroll', scroll); area.removeEventListener('wheel', intent);
      area.removeEventListener('touchmove', intent); area.removeEventListener('keydown', key);
      document.removeEventListener('focusin', focus); window.removeEventListener('resize', reveal);
      window.visualViewport?.removeEventListener('resize', reveal); mobile.removeEventListener('change', reveal);
    };
  }, [list, header, pinned]);
  return hidden && !pinned;
}
