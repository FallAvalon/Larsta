import { useLayoutEffect, type RefObject } from 'react';

type Position = { bottom: boolean; top: number; messageId?: string; offset?: number };
// Layout offsets ignore the entrance animation's temporary translateY.
export function layoutTop(node: HTMLElement): number {
  let top=0,current:HTMLElement|null=node;
  while(current){top+=current.offsetTop;current=current.offsetParent as HTMLElement|null;}
  return top;
}
export function useReadingPosition(id: string, loaded: boolean, scroll: RefObject<HTMLDivElement|null>, follow: RefObject<boolean>, setAtBottom: (bottom:boolean)=>void) {
  useLayoutEffect(()=>{
    const element=scroll.current;if(!loaded||!element)return;
    const key=`larsta-reading-${id}`;
    let saved:Position|undefined;
    try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value&&typeof value.bottom==='boolean'&&Number.isFinite(value.top))saved=value;}catch{/* Reading remains usable without browser storage. */}
    follow.current=saved?.bottom??true;
    if(follow.current)element.scrollTop=element.scrollHeight;
    else {
      element.scrollTop=saved?.top||0;
      const anchor=Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(node=>node.dataset.messageId===saved?.messageId);
      if(anchor&&Number.isFinite(saved?.offset))element.scrollTop=layoutTop(anchor)-layoutTop(element)-saved!.offset!;
    }
    setAtBottom(follow.current);
    let timer:ReturnType<typeof setTimeout>|undefined;
    const save=()=>{
      const top=layoutTop(element);
      const anchor=Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(node=>layoutTop(node)+node.offsetHeight>top+element.scrollTop);
      const position:Position={bottom:element.scrollHeight-element.scrollTop-element.clientHeight<100,top:element.scrollTop,messageId:anchor?.dataset.messageId,offset:anchor?layoutTop(anchor)-top-element.scrollTop:undefined};
      try{localStorage.setItem(key,JSON.stringify(position));}catch{/* Optional per-device preference. */}
    };
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(save,150);};
    const onVisibility=()=>{if(document.visibilityState==='hidden')save();};
    element.addEventListener('scroll',schedule,{passive:true});window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',onVisibility);
    return()=>{clearTimeout(timer);save();element.removeEventListener('scroll',schedule);window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',onVisibility);};
  },[id,loaded,scroll,follow,setAtBottom]);
}
