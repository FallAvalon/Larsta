import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, GitBranch, MessageSquare, RefreshCw, SlidersHorizontal, TextCursorInput, TextSelect, WrapText } from 'lucide-react';
import { Modal } from './Modal';
import { t } from './i18n';
import { useMotionEnabled } from './motion';

const suggestions = [
  {text:'Короче',icon:WrapText}, {text:'Больше диалога',icon:MessageSquare},
  {text:'Больше деталей',icon:TextSelect}, {text:'Не описывай мои действия',icon:TextCursorInput}
];
function readWish(key:string) { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } }

export function RegeneratePanel({ onClose, onGenerate, locked = false, draftKey, returnFocus }: {
  onClose: () => void; onGenerate: (wish:string) => void; locked?: boolean; draftKey: string; returnFocus?: HTMLElement | null;
}) {
  const storageKey = 'larsta-regenerate-' + draftKey;
  const [wish, setWish] = useState(() => readWish(storageKey)), [keyboard, setKeyboard] = useState(false), [hints, setHints] = useState(false), [closing, setClosing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), submitted = useRef(false), inputId = useId();
  const motion = useMotionEnabled();
  const parts = wish.split(/[;\n]/).map(part => part.trim()).filter(Boolean);
  useEffect(() => {
    try { if (wish) sessionStorage.setItem(storageKey, wish); else sessionStorage.removeItem(storageKey); } catch { /* The dialog still works without storage. */ }
  }, [wish, storageKey]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    const measure = () => {
      const height = window.visualViewport?.height || innerHeight;
      const compact = matchMedia('(pointer:coarse)').matches && (height < 500 || height < innerHeight * .78);
      setKeyboard(compact);
    };
    measure(); window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);
  function close() {
    if (closing || submitted.current) return;
    if (!motion) { onClose(); return; }
    setClosing(true); timer.current = setTimeout(onClose, 180);
  }
  function toggle(text:string) {
    const exists = parts.some(part => part.toLowerCase() === text.toLowerCase());
    const next = (exists ? parts.filter(part => part.toLowerCase() !== text.toLowerCase()) : [...parts, text]).join('; ');
    if (next.length <= 1200) setWish(next);
  }
  function generate() {
    if (locked || submitted.current || closing) return;
    submitted.current = true;
    try { sessionStorage.removeItem(storageKey); } catch { /* Optional session draft. */ }
    onGenerate(wish.trim());
  }
  return createPortal(<Modal title={t('Другой ответ')} onClose={close} className="regenerate-panel" viewportFit closing={closing} returnFocus={returnFocus}>
    <form data-keyboard={keyboard} data-hints={hints} onSubmit={event => { event.preventDefault(); generate(); }} onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); generate(); }
    }}>
      <div className="modal-scroll regenerate-body">
        <div className="regenerate-label"><label htmlFor={inputId}>{t('Что изменить?')}</label><small>{t('Необязательно')}</small></div>
        <textarea ref={input} id={inputId} aria-label={t('Пожелание к ответу')} rows={4} maxLength={1200} disabled={locked} placeholder={t('Например, больше диалога и меньше описаний')} value={wish} onChange={event => setWish(event.target.value)}/>
        <button className="regenerate-hints-toggle" type="button" aria-expanded={!keyboard || hints} aria-controls={inputId+'-hints'} onClick={() => setHints(value => !value)}><SlidersHorizontal size={15} aria-hidden="true"/>{t('Подсказки')}<ChevronDown size={14} aria-hidden="true"/></button>
        <div id={inputId+'-hints'} className="regenerate-extras">
          <div className="wish-chips" role="group" aria-label={t('Быстрые пожелания')}>{suggestions.map(({text:key,icon:Icon}) => {
            const text = t(key);
            return <button className="button small" type="button" key={key} disabled={locked} aria-pressed={parts.some(part => part.toLowerCase() === text.toLowerCase())} onClick={() => toggle(text)}><Icon size={14} aria-hidden="true"/>{text}</button>;
          })}</div>
          <details className="regenerate-note"><summary><GitBranch size={14} aria-hidden="true"/><span>{t('Предыдущий ответ сохранится')}</span><ChevronDown size={13} aria-hidden="true"/></summary><p>{t('Пожелание необязательно и действует один раз. Прежний ответ останется в вариантах, а его продолжение — в отдельной ветке.')}</p></details>
        </div>
      </div>
      <footer><button className="button" type="button" onClick={close}>{t('Отмена')}</button><button className="button primary" disabled={locked}><RefreshCw size={16} aria-hidden="true"/>{t('Получить вариант')}</button></footer>
    </form>
  </Modal>, document.body);
}
