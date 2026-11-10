import { t, uiLocale } from './i18n';
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const ToolPanelAnchorContext=createContext<{anchor:HTMLElement|null;open:boolean;style:CSSProperties}>({anchor:null,open:true,style:{}});

/** A small, non-modal popover attached to the button that opened it. */
export function ToolPanel({title,children,onClose,wide=false,compact=false,className=''}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean;compact?:boolean;className?:string}) {
  const {anchor,open,style}=useContext(ToolPanelAnchorContext);
  const ref=useRef<HTMLElement>(null),close=useRef(onClose),heading=useId();close.current=onClose;
  const lastAnchor=useRef<DOMRect|null>(null);
  useLayoutEffect(()=>{
    const panel=ref.current;if(!panel)return;let frame=0;
    const position=()=>{
      if(anchor?.isConnected)lastAnchor.current=anchor.getBoundingClientRect();
      const rect=lastAnchor.current;if(!rect)return;
      const viewport=window.visualViewport,x=viewport?.offsetLeft||0,y=viewport?.offsetTop||0;
      const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight,margin=10,gap=8;
      const panelWidth=Math.min(compact?264:wide?520:380,width-margin*2);
      const above=rect.top-y-margin-gap,below=y+height-margin-rect.bottom-gap;
      const placement=!compact&&Math.max(above,below)<280?'floating':above>=Math.min(compact?150:210,below)?'above':'below';
      panel.style.width=`${panelWidth}px`;
      panel.style.maxHeight=`${Math.max(80,Math.min(compact?440:560,placement==='floating'?height-margin*2:placement==='above'?above:below))}px`;
      const panelHeight=panel.offsetHeight,alignStart=!!anchor?.closest('.composer-model');
      const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,max));
      panel.style.left=`${clamp(alignStart?rect.left:rect.right-panelWidth,x+margin,x+width-panelWidth-margin)}px`;
      panel.style.top=`${clamp(placement==='floating'?y+(height-panelHeight)/2:placement==='above'?rect.top-gap-panelHeight:rect.bottom+gap,y+margin,y+height-panelHeight-margin)}px`;
      panel.style.transformOrigin=placement==='floating'?'center':`${alignStart?'left':'right'} ${placement==='above'?'bottom':'top'}`;
      panel.dataset.placement=placement;panel.dataset.ready='true';
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(position);};
    position();const observer=new ResizeObserver(schedule);observer.observe(panel);
    window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
    window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
    return()=>{
      cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);
      window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);
    };
  },[anchor,compact,wide]);
  useEffect(()=>{
    const panel=ref.current,previous=anchor||document.activeElement as HTMLElement|null;
    panel?.focus({preventScroll:true});
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!event.isComposing&&!panel?.inert){
        event.stopPropagation();close.current();
      }
    };
    const outside=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(!panel?.inert&&!panel?.contains(target)&&!anchor?.contains(target))close.current();
    };
    document.addEventListener('keydown',keydown);
    document.addEventListener('pointerdown',outside,true);
    return()=>{
      document.removeEventListener('keydown',keydown);
      document.removeEventListener('pointerdown',outside,true);
      // Leave focus alone when the user has already returned to the composer.
      if(previous?.isConnected&&(document.activeElement===document.body||panel?.contains(document.activeElement)))previous.focus({preventScroll:true});
    };
  },[anchor]);
  return createPortal(<aside id="chat-tools" className={`tool-panel${wide?' tool-panel-wide':''}${compact?' tool-panel-compact':''} ${className}`} ref={ref} role="region" aria-labelledby={heading} tabIndex={-1} inert={!open} aria-hidden={!open||undefined} data-closing={!open} style={style}>
    {compact?<h2 id={heading} className="tool-panel-title-hidden">{title}</h2>:<header><h2 id={heading}>{title}</h2><button className="icon-button" aria-label={t("Закрыть панель")} onClick={onClose}><X size={19}/></button></header>}
    {children}
  </aside>,document.body);
}
