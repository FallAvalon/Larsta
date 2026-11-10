import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useChatAppearance } from './appearance';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const subscribe = (listener: () => void) => {
  reducedMotion.addEventListener('change', listener);
  return () => reducedMotion.removeEventListener('change', listener);
};
export function useMotionEnabled() {
  const { appearance } = useChatAppearance();
  const reduced = useSyncExternalStore(subscribe, () => reducedMotion.matches);
  return appearance.animations && !reduced;
}

/** A short release response for pointer taps and keyboard activation alike. */
export function useButtonFeedback(enabled:boolean) {
  useEffect(()=>{
    if(!enabled)return;
    const running=new Map<HTMLButtonElement,Animation>();
    const click=(event:MouseEvent)=>{
      const button=event.target instanceof Element?event.target.closest('button'):null;
      if(!button||button.disabled||button.getAttribute('aria-disabled')==='true'||button.closest('[inert]')||button.matches('.chat-menu-dismiss,[data-no-motion]'))return;
      running.get(button)?.cancel();
      const broad=button.matches('.conversation-row,.card-cover,.model-option,.branch-list>button,.chat-list>button');
      const animation=button.animate([
        {scale:broad?'.994':'.96',offset:0},
        {scale:broad?'1.003':'1.015',offset:.6},
        {scale:'1',offset:1}
      ],{duration:280,easing:'cubic-bezier(.2,.7,.25,1)'});
      running.set(button,animation);
      animation.onfinish=animation.oncancel=()=>{if(running.get(button)===animation)running.delete(button);};
    };
    document.addEventListener('click',click,true);
    return()=>{document.removeEventListener('click',click,true);for(const animation of running.values())animation.cancel();};
  },[enabled]);
}

// Retain a closing surface briefly so its exit can finish. The exiting tree is inert,
// and the timer is cancelled if it is reopened before the animation has finished.
export function Presence({ present, children }: { present: boolean; children: ReactNode }) {
  const enabled = useMotionEnabled();
  const [retained, setRetained] = useState(present);
  const last = useRef(children);
  useLayoutEffect(() => {
    if (present) { last.current = children; setRetained(true); return; }
    if (!enabled) { setRetained(false); return; }
    const timer = window.setTimeout(() => setRetained(false), 200);
    return () => window.clearTimeout(timer);
  }, [present, enabled, children]);
  if (!present && (!retained || !enabled)) return null;
  return <div className={`presence${present ? '' : ' is-exiting'}`} inert={!present} aria-hidden={!present || undefined}>{present ? children : last.current}</div>;
}
