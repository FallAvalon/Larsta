import { useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Check, GitBranch, LoaderCircle, Maximize2, Save, Undo2 } from 'lucide-react';
import { Modal } from './Modal';
import { useMotionEnabled } from './motion';
import { appearanceStyle, useChatAppearance } from './appearance';
import { t } from './i18n';

export function TextEditor({ title, initialValue, onSave, onClose, maxLength, placeholder, message = false, selection, returnFocus }: {
  title: string; initialValue: string; onSave: (value: string) => Promise<boolean> | boolean; onClose: () => void;
  maxLength?: number; placeholder?: string; message?: boolean; selection?: [number, number]; returnFocus?: HTMLElement | null;
}) {
  const [value, setValue] = useState(initialValue), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false), [closing, setClosing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), keep = useRef<HTMLButtonElement>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef(false), closed = useRef(false), motion = useMotionEnabled(), noteId = useId();
  const { appearance } = useChatAppearance();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (selection && input.current) { input.current.selectionStart = selection[0]; input.current.selectionEnd = selection[1]; }
  }, []);
  useEffect(() => { if (confirmClose) keep.current?.focus({ preventScroll: true }); }, [confirmClose]);
  const finish = () => {
    if (closed.current) return;
    closed.current = true;
    if (!motion) { onClose(); return; }
    setClosing(true); timer.current = setTimeout(onClose, 180);
  };
  const requestClose = () => {
    if (savingRef.current || closing) return;
    if (confirmClose) { setConfirmClose(false); input.current?.focus({ preventScroll: true }); return; }
    if (value !== initialValue) setConfirmClose(true); else finish();
  };
  async function save() {
    if (savingRef.current || closed.current || confirmClose || (message && !value.trim())) return;
    savingRef.current = true; setSaving(true); setError('');
    try { if (await onSave(value)) finish(); }
    catch (error) { setError((error as Error).message); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return createPortal(<Modal title={title} onClose={requestClose} className="text-editor" viewportFit closing={closing} returnFocus={returnFocus}>
    <form style={appearanceStyle(appearance)} onSubmit={event => { event.preventDefault(); event.stopPropagation(); void save(); }} onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); }
    }}>
      {message && <p className="editor-note" id={noteId}><GitBranch size={15} aria-hidden="true"/><span>{t('Прежняя версия останется в ветке. История продолжится от этой реплики.')}</span></p>}
      <div className="editor-writing"><textarea ref={input} aria-label={message ? t('Текст сообщения') : title} aria-describedby={message ? noteId : undefined} value={value} onChange={event => setValue(event.target.value)} maxLength={maxLength} placeholder={placeholder} readOnly={saving} spellCheck rows={12}/></div>
      {error && <p className="error-box" role="alert">{error}</p>}
      <footer className={confirmClose ? 'editor-confirm' : ''}>
        {confirmClose ? <><p role="status">{t('Выйти без сохранения изменений?')}</p><div className="editor-footer-actions"><button type="button" className="button" onClick={finish}>{t('Не сохранять')}</button><button ref={keep} type="button" className="button primary" onClick={event => { event.preventDefault(); setConfirmClose(false); input.current?.focus({ preventScroll: true }); }}><Undo2 size={16} aria-hidden="true"/>{t('Продолжить правку')}</button></div></> : <>
          <span className="editor-shortcut">{t('Ctrl / ⌘ + Enter — сохранить')}</span>
          <div className="editor-footer-actions"><button type="button" className="button" disabled={saving} onClick={requestClose}>{t('Отмена')}</button><button className="button primary" disabled={saving || (message && !value.trim())}>{saving ? <LoaderCircle size={16} className="spin" aria-hidden="true"/> : message ? <Save size={16} aria-hidden="true"/> : <Check size={16} aria-hidden="true"/>}{saving ? t('Сохраняем…') : message ? t('Сохранить') : t('Применить')}</button></div>
        </>}
      </footer>
    </form>
  </Modal>, document.body);
}

type FieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  label: string; value: string; onChange: (value: string) => void; className?: string;
};
export function ExpandableTextField({ label, value, onChange, className = '', ...props }: FieldProps) {
  const [expanded, setExpanded] = useState(false), input = useRef<HTMLTextAreaElement>(null), selection = useRef<[number, number]>([0, 0]);
  const id = useId();
  return <div className={`expandable-field ${className}`}>
    <div className="expandable-field-heading"><label htmlFor={id}>{label}</label><button type="button" className="field-expand" aria-label={t('Развернуть: {0}', { 0: label })} title={t('Развернуть')} disabled={props.disabled} onClick={() => { selection.current = [input.current?.selectionStart || 0, input.current?.selectionEnd || 0]; setExpanded(true); }}><Maximize2 size={15} aria-hidden="true"/><small>{t('Развернуть')}</small></button></div>
    <textarea {...props} id={id} ref={input} value={value} onChange={event => onChange(event.target.value)}/>
    {expanded && <TextEditor title={label} initialValue={value} maxLength={props.maxLength} placeholder={props.placeholder} selection={selection.current} onSave={next => { onChange(next); return true; }} onClose={() => setExpanded(false)}/>}
  </div>;
}
